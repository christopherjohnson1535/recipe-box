//! Household settings (one row): today only the print treatment of recipe photos.

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    auth::{AdminUser, CurrentUser},
    error::{AppJson, AppResult, ErrorBody},
    state::AppState,
};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    /// Show recipe photos with the print treatment (`imageDisplayUrl`); the originals are always kept.
    pub plate_treatment: bool,
}

/// The household settings.
#[utoipa::path(get, path = "/api/settings", operation_id = "getSettings", tag = "settings", security(("session" = [])), responses(
    (status = 200, description = "The settings.", body = Settings),
))]
pub async fn get(State(state): State<AppState>, _user: CurrentUser) -> AppResult<Json<Settings>> {
    let plate_treatment = sqlx::query_scalar("select plate_treatment from household_settings")
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(Settings { plate_treatment }))
}

/// Changes the household settings. Admin only.
#[utoipa::path(put, path = "/api/settings", operation_id = "updateSettings", tag = "settings", security(("session" = [])), request_body = Settings, responses(
    (status = 200, description = "The settings now in force.", body = Settings),
    (status = 400, description = "Missing or unknown field (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
))]
pub async fn update(
    State(state): State<AppState>,
    _admin: AdminUser,
    AppJson(body): AppJson<Settings>,
) -> AppResult<Json<Settings>> {
    let plate_treatment = sqlx::query_scalar(
        "update household_settings set plate_treatment = $1, updated_at = $2 returning plate_treatment",
    )
    .bind(body.plate_treatment)
    .bind(state.clock.now())
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(Settings { plate_treatment }))
}
