//! Import routes: capabilities, link, text and photo.

use std::time::Instant;

use axum::{
    Json,
    extract::{Multipart, State},
};
use serde::{Deserialize, Serialize};
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

use super::media::{delete_images, store_image, store_jpeg};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppJson, AppResult, ErrorBody},
    import::{
        ai::{self, AiProvider as _},
        jsonld, normalize_url,
        readable::{MIN_PAGE_CHARS, readable},
        safe_fetch::{self, PAGE_MAX_BYTES},
    },
    models::{Image, RecipeDraft, SourceType},
    state::AppState,
    validate,
};

#[derive(Serialize, ToSchema)]
pub struct Capabilities {
    ai: bool,
    provider: AiProvider,
}

/// Mirrors the values `AI_PROVIDER` accepts (checked in `Config::from_env`).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
enum AiProvider {
    None,
    Anthropic,
}

/// What the server can do, so the UI can hide AI features.
#[utoipa::path(get, path = "/api/import/capabilities", operation_id = "getImportCapabilities", tag = "import", security(("session" = [])), responses(
    (status = 200, description = "Whether an AI provider is configured.", body = Capabilities),
))]
pub async fn capabilities(State(state): State<AppState>, _user: CurrentUser) -> Json<Capabilities> {
    let provider = match state.config.ai_provider.as_str() {
        "anthropic" => AiProvider::Anthropic,
        _ => AiProvider::None,
    };
    Json(Capabilities {
        ai: state.config.ai_enabled(),
        provider,
    })
}

#[derive(Deserialize, ToSchema)]
pub struct ImportUrlBody {
    url: String,
}

/// Reads a recipe from a web page (LNK-1/2/5/7). Returns a draft; saves nothing. A page with no recipe data goes to
/// the AI as plain text when AI is on (LNK-3).
#[utoipa::path(post, path = "/api/import/url", operation_id = "importFromUrl", tag = "import", security(("session" = [])), request_body = ImportUrlBody, responses(
    (status = 200, description = "The draft. `sourceUrl` is the final URL after redirects.", body = RecipeDraft),
    (status = 400, description = "Not an http(s) address (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe on the page (`no_recipe_found`), or the address is not public (`blocked_address`).", body = ErrorBody),
    (status = 502, description = "The site refused us (`site_blocked`), the fetch failed or timed out (`fetch_failed`), or the AI fallback failed (`ai_error`).", body = ErrorBody),
))]
pub async fn from_url(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(body): AppJson<ImportUrlBody>,
) -> AppResult<Json<RecipeDraft>> {
    // The shared helper names `sourceUrl`; this endpoint's field is `url`, so use our own message.
    let requested = validate::source_url(Some(&body.url))
        .ok()
        .flatten()
        .and_then(|u| Url::parse(&u).ok())
        .ok_or_else(|| {
            AppError::validation("url: enter a full web address starting with http:// or https://.")
        })?;
    let started = Instant::now();
    let page = safe_fetch::fetch(&state.fetch_policy, &requested, PAGE_MAX_BYTES).await?;
    // Parsing is CPU-bound: off the async workers, and inside what is left of the page's time budget. On a
    // timeout the blocking thread is abandoned (the pre-checks in `extract` bound how long it can run).
    let left = state
        .fetch_policy
        .total_timeout()
        .saturating_sub(started.elapsed());
    let final_url = page.final_url.clone();
    let ai_on = state.config.ai_enabled();
    let parse = tokio::task::spawn_blocking(move || {
        // shortcut: pages are decoded as UTF-8 (lossy); honour <meta charset> if a non-UTF-8 site turns up.
        let html = String::from_utf8_lossy(&page.body);
        if let Some(draft) = jsonld::extract(&html, &page.final_url) {
            return Parsed::Draft(Box::new(draft));
        }
        if !ai_on {
            return Parsed::Nothing;
        }
        let page_text = readable(&html, &page.final_url);
        let site_name = jsonld::site_name(&html, &page.final_url);
        Parsed::Text(page_text, site_name)
    });
    let parsed = tokio::time::timeout(left, parse)
        .await
        .map_err(|_| AppError::FetchFailed("That page took too long to read.".into()))?
        .map_err(|e| anyhow::anyhow!(e))?;
    let no_recipe = || {
        AppError::NoRecipeFound(
            "We couldn't find a recipe on that page. You can paste the recipe text instead.".into(),
        )
    };
    let mut draft = match parsed {
        Parsed::Draft(d) => *d,
        Parsed::Nothing => return Err(no_recipe()),
        Parsed::Text(page_text, site_name) => {
            if page_text
                .text
                .chars()
                .filter(|c| !c.is_whitespace())
                .count()
                < MIN_PAGE_CHARS
            {
                return Err(no_recipe());
            }
            // Outside the page budget: the AI call has its own timeout.
            let mut d = match state.ai.recipe_from_text(&page_text.text).await {
                Err(AppError::NoRecipeFound(_)) => return Err(no_recipe()),
                r => r?,
            };
            d.source_type = SourceType::Link;
            d.source_url = Some(jsonld::shown_url(&final_url));
            d.source_name = site_name;
            d.image_url = page_text.image_url;
            d.warnings
                .push("Read from the page text by AI — check it against the page.".into());
            d
        }
    };
    draft.duplicate_of = duplicate_of(&state, &[&requested, &final_url]).await?;
    attach_image(&state, user.id, &mut draft).await;
    Ok(Json(draft))
}

/// What the blocking parse of a fetched page found.
enum Parsed {
    Draft(Box<RecipeDraft>),
    /// No recipe data; the page's text and site name, for the AI fallback.
    Text(crate::import::readable::Readable, Option<String>),
    Nothing,
}

/// Id of a live recipe saved from the same page (LNK-5), comparing normalised URLs.
async fn duplicate_of(state: &AppState, urls: &[&Url]) -> AppResult<Option<Uuid>> {
    // Credentials and fragments never count: the saved `source_url` has none.
    let urls: Vec<Url> = urls.iter().map(|u| jsonld::cleaned(u)).collect();
    let wanted: Vec<String> = urls.iter().map(normalize_url).collect();
    let hosts: Vec<String> = urls
        .iter()
        .filter_map(|u| u.host_str())
        .map(str::to_string)
        .collect();
    // shortcut: normalises in Rust over every live recipe from the same host (prefiltered by the repository);
    // store a normalised column with an index if one host ever has thousands of recipes.
    let rows = state.recipes.live_source_urls(&hosts).await?;
    Ok(rows
        .into_iter()
        .find(|(_, saved)| Url::parse(saved).is_ok_and(|u| wanted.contains(&normalize_url(&u))))
        .map(|(id, _)| id))
}

/// Downloads the page's main photo through the SSRF guard and stores it (re-encoded). A failure only adds a
/// warning: the recipe is still worth reviewing.
async fn attach_image(state: &AppState, user_id: Uuid, draft: &mut RecipeDraft) {
    let Some(remote) = draft.image_url.take() else {
        return;
    };
    let stored = async {
        let url = Url::parse(&remote).map_err(|_| AppError::BlockedAddress)?;
        let img =
            safe_fetch::fetch(&state.fetch_policy, &url, state.config.max_upload_bytes()).await?;
        store_image(state, user_id, img.body).await
    }
    .await;
    match stored {
        Ok(img) => {
            draft.image_id = Some(img.id);
            draft.image_url = Some(img.url);
        }
        Err(e) => {
            tracing::info!(error = %e, image = %remote, "import image skipped");
            draft.warnings.push(
                "The recipe photo could not be downloaded; add one yourself if you like.".into(),
            );
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportTextBody {
    text: String,
    source_url: Option<String>,
}

/// Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches `sourceUrl`.
#[utoipa::path(post, path = "/api/import/text", operation_id = "importFromText", tag = "import", security(("session" = [])), request_body = ImportTextBody, responses(
    (status = 200, description = "The draft. `sourceType` is `text`; `sourceUrl` is the given address without credentials or fragment.", body = RecipeDraft),
    (status = 400, description = "Empty text or a bad `sourceUrl` (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe in the text (`no_recipe_found`), or no AI provider (`ai_disabled`).", body = ErrorBody),
    (status = 502, description = "The AI provider failed (`ai_error`).", body = ErrorBody),
))]
pub async fn from_text(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppJson(body): AppJson<ImportTextBody>,
) -> AppResult<Json<RecipeDraft>> {
    if body.text.trim().is_empty() {
        return Err(AppError::validation("text: paste the recipe text."));
    }
    // Cleaned first so credentials cannot hide a duplicate.
    let source = validate::source_url(body.source_url.as_deref())?
        .and_then(|u| Url::parse(&u).ok())
        .map(|u| jsonld::cleaned(&u));
    let mut draft = state.ai.recipe_from_text(&body.text).await?;
    if body.text.chars().count() > ai::MAX_TEXT_INPUT_CHARS {
        draft.warnings.push(format!(
            "The text was very long, so only the first {} characters were read.",
            ai::MAX_TEXT_INPUT_CHARS
        ));
    }
    if let Some(url) = source {
        draft.source_url = Some(url.to_string());
        draft.duplicate_of = duplicate_of(&state, &[&url]).await?;
    }
    Ok(Json(draft))
}

/// What the photos show.
#[derive(ToSchema)]
#[schema(rename_all = "lowercase")]
#[allow(dead_code)] // schema only
pub enum PhotoMode {
    /// A cookbook page, card or screenshot of a recipe.
    Recipe,
    /// A photo of a finished dish.
    Dish,
}

/// Multipart body of `POST /api/import/photo`.
#[derive(ToSchema)]
#[allow(dead_code)] // schema only; the handler reads the multipart stream itself
pub struct PhotoForm {
    /// 1 to 6 images (repeat the field).
    #[schema(value_type = Vec<String>, format = Binary)]
    files: Vec<Vec<u8>>,
    mode: PhotoMode,
}

/// Most photos in one import (PHO-3).
pub const MAX_PHOTOS: usize = 6;

/// Reads a recipe from photos (PHO-2–5). Returns a draft with `photoImageIds` set.
#[utoipa::path(post, path = "/api/import/photo", operation_id = "importFromPhoto", tag = "import", security(("session" = [])),
    request_body(content = PhotoForm, content_type = "multipart/form-data"), responses(
    (status = 200, description = "The draft. `photoImageIds` lists the stored photos in upload order; in `dish` mode `imageId` is the first.", body = RecipeDraft),
    (status = 400, description = "No files, more than 6, or a bad `mode` (`validation`).", body = ErrorBody),
    (status = 413, description = "A file is over `MAX_UPLOAD_MB` (`too_large`).", body = ErrorBody),
    (status = 415, description = "A file is not an image we can read, including a HEIC the server cannot decode (`unsupported_media`). Nothing is kept.", body = ErrorBody),
    (status = 422, description = "No AI provider (`ai_disabled`) or no recipe in the photos (`no_recipe_found`). The photos stay stored and `error.photoImageIds` lists them.", body = ErrorBody),
    (status = 502, description = "The AI provider failed (`ai_error`). The photos stay stored and `error.photoImageIds` lists them.", body = ErrorBody),
))]
pub async fn from_photo(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<RecipeDraft>> {
    let (mut files, mut mode) = (Vec::new(), None);
    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("files") => {
                if files.len() == MAX_PHOTOS {
                    return Err(AppError::validation("files: send at most 6 photos."));
                }
                // Stop reading as soon as the file is over the limit, not after buffering all of it.
                let data = read_capped(field, state.config.max_upload_bytes()).await?;
                files.push(data.ok_or(AppError::TooLarge)?);
            }
            Some("mode") => {
                let bytes = read_capped(field, 16).await?;
                let bad = || AppError::validation("mode: use recipe or dish.");
                mode = Some(String::from_utf8(bytes.ok_or_else(bad)?).map_err(|_| bad())?);
            }
            _ => {}
        }
    }
    if files.is_empty() {
        return Err(AppError::validation("files: send 1 to 6 photos."));
    }
    let dish = match mode.as_deref() {
        None | Some("recipe") => false,
        Some("dish") => true,
        Some(_) => return Err(AppError::validation("mode: use recipe or dish.")),
    };

    let (mut images, mut jpegs) = (Vec::new(), Vec::new());
    let mut stored = StoredGuard::new(&state);
    for data in files {
        match store_jpeg(&state, user.id, data).await {
            Ok((image, jpeg)) => {
                stored.ids.push(image.id);
                images.push(image);
                jpegs.push(jpeg);
            }
            Err(e) => {
                stored.delete().await;
                return Err(e);
            }
        }
    }
    let ids = ids_of(&images);
    let mode = if dish {
        ai::PhotoMode::Dish
    } else {
        ai::PhotoMode::Recipe
    };
    match state.ai.recipe_from_images(&jpegs, mode).await {
        Ok(mut draft) => {
            stored.keep();
            draft.photo_image_ids = ids;
            if dish {
                draft.image_id = Some(images[0].id);
                draft.image_url = Some(images[0].url.clone());
            }
            Ok(Json(draft))
        }
        // No draft, but the photos are kept so the form can show them next to an empty recipe (PHO-5).
        Err(error @ (AppError::AiDisabled | AppError::NoRecipeFound(_) | AppError::AiError(_))) => {
            stored.keep();
            Err(AppError::WithPhotos {
                error: Box::new(error),
                photo_image_ids: ids,
            })
        }
        Err(e) => {
            stored.delete().await;
            Err(e)
        }
    }
}

/// Reads a multipart field chunk by chunk; `None` as soon as it is longer than `limit` bytes.
async fn read_capped(
    mut field: axum::extract::multipart::Field<'_>,
    limit: usize,
) -> AppResult<Option<Vec<u8>>> {
    let mut out = Vec::new();
    while let Some(chunk) = field.chunk().await? {
        if out.len() + chunk.len() > limit {
            return Ok(None);
        }
        out.extend_from_slice(&chunk);
    }
    Ok(Some(out))
}

/// Ids of the photos stored by this request. Unless [`keep`](Self::keep)t, they are deleted when the guard drops,
/// so a client that disconnects mid-request (the handler future is dropped) leaves no orphan images.
struct StoredGuard {
    state: AppState,
    ids: Vec<Uuid>,
    armed: bool,
}

impl StoredGuard {
    fn new(state: &AppState) -> Self {
        Self {
            state: state.clone(),
            ids: Vec::new(),
            armed: true,
        }
    }

    fn keep(&mut self) {
        self.armed = false;
    }

    /// Deletes the photos now (so the caller's response comes after they are gone).
    async fn delete(mut self) {
        self.armed = false;
        delete_images(&self.state, &self.ids).await;
    }
}

impl Drop for StoredGuard {
    fn drop(&mut self) {
        if self.armed && !self.ids.is_empty() {
            let (state, ids) = (self.state.clone(), std::mem::take(&mut self.ids));
            tokio::spawn(async move { delete_images(&state, &ids).await });
        }
    }
}

fn ids_of(images: &[Image]) -> Vec<Uuid> {
    images.iter().map(|i| i.id).collect()
}
