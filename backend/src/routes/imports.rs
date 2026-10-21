//! Import routes. Capabilities is real; the rest are 501 stubs until the import issues land
//! (see `crate::import` for what each must do).

use axum::{Json, extract::State};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use url::Url;
use uuid::Uuid;

use super::{media::store_image, not_implemented};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppJson, AppResult},
    import::{
        jsonld, normalize_url,
        safe_fetch::{self, PAGE_MAX_BYTES},
    },
    models::RecipeDraft,
    state::AppState,
    validate,
};

pub async fn capabilities(State(state): State<AppState>, _user: CurrentUser) -> Json<Value> {
    Json(json!({ "ai": state.config.ai_enabled(), "provider": state.config.ai_provider }))
}

#[derive(Deserialize)]
pub struct UrlBody {
    url: String,
}

/// `POST /api/import/url` `{ url }` → `RecipeDraft` (LNK-1/2/5/7). Saves nothing.
pub async fn from_url(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(body): AppJson<UrlBody>,
) -> AppResult<Json<RecipeDraft>> {
    let requested = validate::source_url(Some(&body.url))?
        .and_then(|u| Url::parse(&u).ok())
        .ok_or_else(|| {
            AppError::validation("url: enter a full web address starting with http:// or https://.")
        })?;
    let page = safe_fetch::fetch(&state.fetch_policy, &requested, PAGE_MAX_BYTES).await?;
    // shortcut: pages are decoded as UTF-8 (lossy); honour <meta charset> if a non-UTF-8 site turns up.
    let html = String::from_utf8_lossy(&page.body);
    let mut draft = jsonld::extract(&html, &page.final_url).ok_or_else(|| {
        AppError::NoRecipeFound(
            "We couldn't find a recipe on that page. You can paste the recipe text instead.".into(),
        )
    })?;
    draft.duplicate_of = duplicate_of(&state.pool, &[&requested, &page.final_url]).await?;
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

/// `POST /api/import/text` `{ text, sourceUrl? }` → `RecipeDraft` (LNK-3/4).
pub async fn from_text(_user: CurrentUser) -> AppError {
    not_implemented("Import from text")
}

/// `POST /api/import/photo` multipart `files` (1–6) + `mode` → `RecipeDraft` (PHO-2–5).
pub async fn from_photo(_user: CurrentUser) -> AppError {
    not_implemented("Import from photos")
}
