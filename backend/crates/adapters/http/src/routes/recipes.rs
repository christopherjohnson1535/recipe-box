use axum::{Json, extract::State, http::StatusCode};
use domain::Sort;
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    HttpState,
    dto::{Recipe, RecipeInput, RecipeSummary},
    error::{AppError, AppJson, AppPath, AppQuery, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// Sort orders for `GET /api/recipes`; the handler matches the raw string, so anything else is a 400.
#[derive(ToSchema)]
#[schema(rename_all = "lowercase")]
#[allow(dead_code)] // schema only
pub enum RecipeSort {
    Newest,
    Title,
    Time,
}

#[derive(Deserialize, IntoParams)]
#[serde(default)]
#[into_params(parameter_in = Query)]
pub struct ListQuery {
    /// Search text; blank means no filter.
    q: Option<String>,
    /// Exact tag name, case-insensitive.
    tag: Option<String>,
    /// Default `newest`, or relevance when `q` is set.
    #[param(value_type = Option<RecipeSort>)]
    sort: Option<String>,
    /// 1 to 200.
    #[param(minimum = 1, maximum = 200)]
    limit: i64,
    /// 0 or more.
    #[param(minimum = 0)]
    offset: i64,
}

impl Default for ListQuery {
    fn default() -> Self {
        Self {
            q: None,
            tag: None,
            sort: None,
            limit: 50,
            offset: 0,
        }
    }
}

#[derive(serde::Serialize, ToSchema)]
pub struct RecipePage {
    items: Vec<RecipeSummary>,
    total: i64,
}

/// Live recipes, searchable and sortable.
#[utoipa::path(get, path = "/api/recipes", operation_id = "listRecipes", tag = "recipes", security(("session" = [])), params(ListQuery), responses(
    (status = 200, description = "A page of recipes; `total` counts all matches.", body = RecipePage),
    (status = 400, description = "Bad `limit`, `offset` or `sort` (`validation`).", body = ErrorBody),
))]
pub async fn list(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppQuery(q): AppQuery<ListQuery>,
) -> AppResult<Json<RecipePage>> {
    // Ranked by relevance when searching and no sort was asked for.
    let sort = match q.sort.as_deref() {
        None => Sort::Default,
        Some("newest") => Sort::Newest,
        Some("title") => Sort::Title,
        Some("time") => Sort::Time,
        _ => return Err(AppError::validation("sort: newest, title or time.")),
    };
    let page = state
        .services
        .recipes
        .search(q.q, q.tag, sort, q.limit, q.offset)
        .await?;
    Ok(Json(RecipePage {
        items: page.items.into_iter().map(Into::into).collect(),
        total: page.total,
    }))
}

/// Saves a new recipe.
#[utoipa::path(post, path = "/api/recipes", operation_id = "createRecipe", tag = "recipes", security(("session" = [])), request_body = RecipeInput, responses(
    (status = 201, description = "The saved recipe.", body = Recipe),
    (status = 400, description = "Invalid field or unknown image id (`validation`).", body = ErrorBody),
))]
pub async fn create(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppJson(input): AppJson<RecipeInput>,
) -> AppResult<(StatusCode, Json<Recipe>)> {
    let recipe = state.services.recipes.create(user.id, input.into()).await?;
    Ok((StatusCode::CREATED, Json(recipe.into())))
}

/// One live recipe.
#[utoipa::path(get, path = "/api/recipes/{id}", operation_id = "getRecipe", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 200, description = "The recipe.", body = Recipe),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn get(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<Json<Recipe>> {
    Ok(Json(state.services.recipes.get(id).await?.into()))
}

/// Replaces every field of a live recipe.
#[utoipa::path(put, path = "/api/recipes/{id}", operation_id = "updateRecipe", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), request_body = RecipeInput, responses(
    (status = 200, description = "The updated recipe.", body = Recipe),
    (status = 400, description = "Invalid field, unknown image id or malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or deleted (`not_found`).", body = ErrorBody),
))]
pub async fn update(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
    AppJson(input): AppJson<RecipeInput>,
) -> AppResult<Json<Recipe>> {
    let recipe = state
        .services
        .recipes
        .update(id, user.id, input.into())
        .await?;
    Ok(Json(recipe.into()))
}

/// Soft delete; the row is purged a day later.
#[utoipa::path(delete, path = "/api/recipes/{id}", operation_id = "deleteRecipe", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 204, description = "Recipe deleted."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe, or already deleted (`not_found`).", body = ErrorBody),
))]
pub async fn remove(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.recipes.delete(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Undoes a delete made in the last 10 minutes.
#[utoipa::path(post, path = "/api/recipes/{id}/restore", operation_id = "restoreRecipe", tag = "recipes", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Recipe id")), responses(
    (status = 200, description = "The restored recipe.", body = Recipe),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such recipe (`not_found`).", body = ErrorBody),
    (status = 409, description = "Deleted too long ago (`conflict`).", body = ErrorBody),
))]
pub async fn restore(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<Json<Recipe>> {
    Ok(Json(state.services.recipes.restore(id).await?.into()))
}
