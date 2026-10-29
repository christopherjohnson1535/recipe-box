//! A member's own favourites (REC-5). The list filter is `GET /api/recipes?favourite=true`.

use axum::{extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    HttpState,
    error::{AppPath, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// Stars a recipe for the signed-in member. Starring it again is fine.
#[utoipa::path(put, path = "/api/recipes/{id}/favourite", operation_id = "addFavourite", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 204, description = "Starred."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn add(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.recipes.favourite(user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Takes the signed-in member's star off a recipe. Not starred is fine.
#[utoipa::path(delete, path = "/api/recipes/{id}/favourite", operation_id = "removeFavourite", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 204, description = "Not starred any more."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn remove(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.recipes.unfavourite(user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
