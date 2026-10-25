//! The household grocery list (GRO): one list shared by every signed-in member. Every write answers with the new
//! state so two people shopping converge by refetching.

use axum::{Json, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    HttpState,
    dto::{
        AddGroceryItem, AddGroceryRecipe, GoogleExport, GoogleExportRequest, GroceryItem,
        GroceryList, UpdateGroceryItem,
    },
    error::{AppJson, AppPath, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// The list, made empty on first use. A recipe deleted since the last write is already gone from it.
#[utoipa::path(get, path = "/api/grocery", operation_id = "getGroceryList", tag = "grocery", security(("session" = [])), responses(
    (status = 200, description = "The list.", body = GroceryList),
))]
pub async fn get(
    State(state): State<HttpState>,
    _user: CurrentUser,
) -> AppResult<Json<GroceryList>> {
    Ok(Json(state.services.grocery.get().await?.into()))
}

/// Empties the list: recipes and items. The household's section choices and staples are kept.
#[utoipa::path(delete, path = "/api/grocery", operation_id = "clearGroceryList", tag = "grocery", security(("session" = [])), responses(
    (status = 204, description = "The list is empty."),
))]
pub async fn clear(State(state): State<HttpState>, _user: CurrentUser) -> AppResult<StatusCode> {
    state.services.grocery.clear_all().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Puts a live recipe on the list, or sets the scale of one already there, and rebuilds the items.
#[utoipa::path(post, path = "/api/grocery/recipes", operation_id = "addGroceryRecipe", tag = "grocery", security(("session" = [])), request_body = AddGroceryRecipe, responses(
    (status = 200, description = "The list now.", body = GroceryList),
    (status = 400, description = "Missing `recipeId` or a `scale` outside 0.25-10 (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn add_recipe(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppJson(body): AppJson<AddGroceryRecipe>,
) -> AppResult<Json<GroceryList>> {
    let list = state
        .services
        .grocery
        .add_recipe(body.recipe_id, body.scale)
        .await?;
    Ok(Json(list.into()))
}

/// Takes a recipe off the list and rebuilds the items.
#[utoipa::path(delete, path = "/api/grocery/recipes/{recipeId}", operation_id = "removeGroceryRecipe", tag = "grocery", security(("session" = [])),
    params(("recipeId" = Uuid, Path, description = "Recipe id")), responses(
    (status = 200, description = "The list now.", body = GroceryList),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "The recipe is not on the list (`not_found`).", body = ErrorBody),
))]
pub async fn remove_recipe(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(recipe_id): AppPath<Uuid>,
) -> AppResult<Json<GroceryList>> {
    Ok(Json(
        state
            .services
            .grocery
            .remove_recipe(recipe_id)
            .await?
            .into(),
    ))
}

/// Adds an item by hand.
#[utoipa::path(post, path = "/api/grocery/items", operation_id = "addGroceryItem", tag = "grocery", security(("session" = [])), request_body = AddGroceryItem, responses(
    (status = 201, description = "The new item.", body = GroceryItem),
    (status = 400, description = "`text` empty or over 200 characters, or an unknown `section` (`validation`).", body = ErrorBody),
))]
pub async fn add_item(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppJson(body): AppJson<AddGroceryItem>,
) -> AppResult<(StatusCode, Json<GroceryItem>)> {
    let item = state
        .services
        .grocery
        .add_item(&body.text, body.section.map(Into::into))
        .await?;
    Ok((StatusCode::CREATED, Json(item.into())))
}

/// Ticks, moves or marks an item. A new `section` is remembered for the item's name.
#[utoipa::path(patch, path = "/api/grocery/items/{id}", operation_id = "updateGroceryItem", tag = "grocery", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Item id")), request_body = UpdateGroceryItem, responses(
    (status = 200, description = "The item now.", body = GroceryItem),
    (status = 400, description = "No field given, an unknown `section` or a malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such item (`not_found`).", body = ErrorBody),
))]
pub async fn update_item(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<UpdateGroceryItem>,
) -> AppResult<Json<GroceryItem>> {
    let patch = app::ItemPatch {
        checked: body.checked,
        section: body.section.map(Into::into),
        staple: body.staple,
    };
    Ok(Json(
        state.services.grocery.update_item(id, patch).await?.into(),
    ))
}

/// Deletes a manual item; clears a generated one, which stays off the list until its amounts change.
#[utoipa::path(delete, path = "/api/grocery/items/{id}", operation_id = "removeGroceryItem", tag = "grocery", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Item id")), responses(
    (status = 204, description = "The item is off the list."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such item (`not_found`).", body = ErrorBody),
))]
pub async fn remove_item(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.grocery.clear_item(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Clears every ticked item the way `DELETE /api/grocery/items/{id}` does.
#[utoipa::path(post, path = "/api/grocery/clear-checked", operation_id = "clearCheckedGroceryItems", tag = "grocery", security(("session" = [])), responses(
    (status = 200, description = "The list now.", body = GroceryList),
))]
pub async fn clear_checked(
    State(state): State<HttpState>,
    _user: CurrentUser,
) -> AppResult<Json<GroceryList>> {
    Ok(Json(state.services.grocery.clear_checked().await?.into()))
}

/// Sends the unticked items to the member's Google Tasks list `Groceries`: one parent task per store section, the
/// items as subtasks. The list is emptied first, so sending again never duplicates. One send per member at a time.
#[utoipa::path(post, path = "/api/grocery/export/google-tasks", operation_id = "exportGroceryToGoogleTasks", tag = "grocery", security(("session" = [])), request_body = GoogleExportRequest, responses(
    (status = 200, description = "What was sent.", body = GoogleExport),
    (status = 400, description = "Malformed body (`validation`).", body = ErrorBody),
    (status = 409, description = "No Google account connected, or Google no longer accepts the connection (`google_not_connected`; the token is then forgotten, the task list is remembered), or a send for this member is already running (`conflict`).", body = ErrorBody),
    (status = 422, description = "Google Tasks is not set up on this server (`google_disabled`).", body = ErrorBody),
    (status = 502, description = "Google failed: timeout, 5xx, a refusal or an unreadable reply (`google_error`). The list in Google Tasks may be partly filled; sending again starts over.", body = ErrorBody),
))]
pub async fn export_google_tasks(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppJson(body): AppJson<GoogleExportRequest>,
) -> AppResult<Json<GoogleExport>> {
    let sent = state
        .services
        .google
        .export(user.id, body.include_staples.unwrap_or(false))
        .await?;
    Ok(Json(sent.into()))
}
