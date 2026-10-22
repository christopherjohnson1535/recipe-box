use axum::{Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{auth::CurrentUser, error::AppResult, state::AppState};

#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct TagCount {
    name: String,
    count: i64,
}

/// Tags used by live recipes, with counts, sorted by name.
#[utoipa::path(get, path = "/api/tags", operation_id = "listTags", tag = "tags", security(("session" = [])), responses(
    (status = 200, description = "Tags in use.", body = Vec<TagCount>),
))]
pub async fn list(
    State(state): State<AppState>,
    _user: CurrentUser,
) -> AppResult<Json<Vec<TagCount>>> {
    let tags = sqlx::query_as::<_, TagCount>(
        "select t.name::text as name, count(*) as count
         from tags t
         join recipe_tags rt on rt.tag_id = t.id
         join recipes r on r.id = rt.recipe_id and r.deleted_at is null
         group by t.id, t.name
         order by t.name",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(tags))
}
