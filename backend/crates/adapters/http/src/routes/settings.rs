//! Household settings (one row): today only the print treatment of recipe photos.

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    HttpState,
    error::{AppJson, AppResult, ErrorBody},
    extract::{AdminUser, CurrentUser},
};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    /// Show recipe photos with the print treatment (`imageDisplayUrl`); the originals are always kept.
    pub plate_treatment: bool,
}

impl From<domain::Settings> for Settings {
    fn from(s: domain::Settings) -> Self {
        Self {
            plate_treatment: s.plate_treatment,
        }
    }
}

/// The household settings.
#[utoipa::path(get, path = "/api/settings", operation_id = "getSettings", tag = "settings", security(("session" = [])), responses(
    (status = 200, description = "The settings.", body = Settings),
))]
pub async fn get(State(state): State<HttpState>, _user: CurrentUser) -> AppResult<Json<Settings>> {
    Ok(Json(state.services.settings.get().await?.into()))
}

/// Changes the household settings. Admin only.
#[utoipa::path(put, path = "/api/settings", operation_id = "updateSettings", tag = "settings", security(("session" = [])), request_body = Settings, responses(
    (status = 200, description = "The settings now in force.", body = Settings),
    (status = 400, description = "Missing or unknown field (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
))]
pub async fn update(
    State(state): State<HttpState>,
    _admin: AdminUser,
    AppJson(body): AppJson<Settings>,
) -> AppResult<Json<Settings>> {
    let settings = state
        .services
        .settings
        .set(domain::Settings {
            plate_treatment: body.plate_treatment,
        })
        .await?;
    Ok(Json(settings.into()))
}
