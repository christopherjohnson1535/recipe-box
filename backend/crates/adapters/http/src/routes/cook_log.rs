//! The "made it" log of a recipe (REC-6).

use axum::{Json, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    HttpState,
    dto::{CookLogEntry, NewCookLogEntry},
    error::{AppJson, AppPath, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// When the household cooked a recipe, newest first.
#[utoipa::path(get, path = "/api/recipes/{id}/cook-log", operation_id = "listCookLog", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 200, description = "Entries by cooking day, newest first.", body = Vec<CookLogEntry>),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn list(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<Json<Vec<CookLogEntry>>> {
    let entries = state.services.cook_log.list(id).await?;
    Ok(Json(entries.into_iter().map(Into::into).collect()))
}

/// Records that the signed-in member made the recipe.
#[utoipa::path(post, path = "/api/recipes/{id}/cook-log", operation_id = "addCookLogEntry", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), request_body = NewCookLogEntry, responses(
    (status = 201, description = "The new entry.", body = CookLogEntry),
    (status = 400, description = "A day in the future, a note over 2,000 characters, or a malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn add(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<NewCookLogEntry>,
) -> AppResult<(StatusCode, Json<CookLogEntry>)> {
    let entry = state
        .services
        .cook_log
        .add(&user, id, body.cooked_on, &body.note)
        .await?;
    Ok((StatusCode::CREATED, Json(entry.into())))
}

/// Deletes an entry: the member who made it, or an admin.
#[utoipa::path(delete, path = "/api/recipes/{id}/cook-log/{entryId}", operation_id = "deleteCookLogEntry", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id"), ("entryId" = Uuid, Path, description = "Entry id")), responses(
    (status = 204, description = "Entry deleted."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 403, description = "Someone else's entry, and not an admin (`forbidden`).", body = ErrorBody),
    (status = 404, description = "No such recipe or entry, or the recipe is deleted (`not_found`).", body = ErrorBody),
))]
pub async fn remove(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath((id, entry_id)): AppPath<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    state.services.cook_log.delete(&user, id, entry_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
