//! Import routes. Capabilities is real; the rest are 501 stubs until the import issues land
//! (see `crate::import` for what each must do).

use std::time::Instant;

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

use super::{media::store_image, not_implemented};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppJson, AppResult, ErrorBody},
    import::{
        jsonld, normalize_url,
        safe_fetch::{self, PAGE_MAX_BYTES},
    },
    models::RecipeDraft,
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

/// Reads a recipe from a web page (LNK-1/2/5/7). Returns a draft; saves nothing.
#[utoipa::path(post, path = "/api/import/url", operation_id = "importFromUrl", tag = "import", security(("session" = [])), request_body = ImportUrlBody, responses(
    (status = 200, description = "The draft. `sourceUrl` is the final URL after redirects.", body = RecipeDraft),
    (status = 400, description = "Not an http(s) address (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe on the page (`no_recipe_found`), or the address is not public (`blocked_address`).", body = ErrorBody),
    (status = 502, description = "The site refused us (`site_blocked`), or the fetch failed or timed out (`fetch_failed`).", body = ErrorBody),
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
    let parse = tokio::task::spawn_blocking(move || {
        // shortcut: pages are decoded as UTF-8 (lossy); honour <meta charset> if a non-UTF-8 site turns up.
        jsonld::extract(&String::from_utf8_lossy(&page.body), &page.final_url)
    });
    let extracted = tokio::time::timeout(left, parse)
        .await
        .map_err(|_| AppError::FetchFailed("That page took too long to read.".into()))?
        .map_err(|e| anyhow::anyhow!(e))?;
    let mut draft = extracted.ok_or_else(|| {
        AppError::NoRecipeFound(
            "We couldn't find a recipe on that page. You can paste the recipe text instead.".into(),
        )
    })?;
    draft.duplicate_of = duplicate_of(&state.pool, &[&requested, &final_url]).await?;
    attach_image(&state, user.id, &mut draft).await;
    Ok(Json(draft))
}

/// Id of a live recipe saved from the same page (LNK-5), comparing normalised URLs.
async fn duplicate_of(pool: &PgPool, urls: &[&Url]) -> AppResult<Option<Uuid>> {
    let wanted: Vec<String> = urls.iter().map(|u| normalize_url(u)).collect();
    let patterns: Vec<String> = urls
        .iter()
        .filter_map(|u| u.host_str())
        .map(|h| format!("%{h}%"))
        .collect();
    // shortcut: normalises in Rust over every live recipe from the same host (prefiltered by ILIKE); store a
    // normalised column with an index if one host ever has thousands of recipes.
    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "select id, source_url from recipes where deleted_at is null and source_url ilike any($1) order by created_at",
    )
    .bind(patterns)
    .fetch_all(pool)
    .await?;
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
#[allow(dead_code)] // the stub handler does not read it yet
pub struct ImportTextBody {
    text: String,
    source_url: Option<String>,
}

/// Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft.
#[utoipa::path(post, path = "/api/import/text", operation_id = "importFromText", tag = "import", security(("session" = [])), request_body = ImportTextBody, responses(
    (status = 200, description = "The draft.", body = RecipeDraft),
    (status = 400, description = "Invalid body (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe in the text (`no_recipe_found`), or no AI provider (`ai_disabled`).", body = ErrorBody),
    (status = 501, description = "Not built yet (`not_implemented`); every call returns this today.", body = ErrorBody),
))]
pub async fn from_text(_user: CurrentUser) -> AppError {
    not_implemented("Import from text")
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

/// Reads a recipe from photos (PHO-2–5). Returns a draft with `photoImageIds` set.
#[utoipa::path(post, path = "/api/import/photo", operation_id = "importFromPhoto", tag = "import", security(("session" = [])),
    request_body(content = PhotoForm, content_type = "multipart/form-data"), responses(
    (status = 200, description = "The draft.", body = RecipeDraft),
    (status = 400, description = "Missing files or bad `mode` (`validation`).", body = ErrorBody),
    (status = 415, description = "A file is not an image we can read (`unsupported_media`).", body = ErrorBody),
    (status = 422, description = "No recipe in the photos (`no_recipe_found`), or no AI provider (`ai_disabled`; the photos are stored first).", body = ErrorBody),
    (status = 501, description = "Not built yet (`not_implemented`); every call returns this today.", body = ErrorBody),
))]
pub async fn from_photo(_user: CurrentUser) -> AppError {
    not_implemented("Import from photos")
}
