//! Import routes. Capabilities is real; the rest are 501 stubs until the import issues land
//! (see `crate::import` for what each must do).

use axum::{Json, extract::State};
use serde_json::{Value, json};

use super::not_implemented;
use crate::{auth::CurrentUser, error::AppError, state::AppState};

pub async fn capabilities(State(state): State<AppState>, _user: CurrentUser) -> Json<Value> {
    Json(json!({ "ai": state.config.ai_enabled(), "provider": state.config.ai_provider }))
}

/// `POST /api/import/url` `{ url }` → `RecipeDraft` (LNK-1/2/5/7).
pub async fn from_url(_user: CurrentUser) -> AppError {
    not_implemented("Import from a link")
}

/// `POST /api/import/text` `{ text, sourceUrl? }` → `RecipeDraft` (LNK-3/4).
pub async fn from_text(_user: CurrentUser) -> AppError {
    not_implemented("Import from text")
}

/// `POST /api/import/photo` multipart `files` (1–6) + `mode` → `RecipeDraft` (PHO-2–5).
pub async fn from_photo(_user: CurrentUser) -> AppError {
    not_implemented("Import from photos")
}
