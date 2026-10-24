use axum::{Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{HttpState, error::AppResult, extract::CurrentUser};

#[derive(Serialize, ToSchema)]
pub struct TagCount {
    name: String,
    count: i64,
}

/// Tags used by live recipes, with counts, sorted by name.
#[utoipa::path(get, path = "/api/tags", operation_id = "listTags", tag = "tags", security(("session" = [])), responses(
    (status = 200, description = "Tags in use.", body = Vec<TagCount>),
))]
pub async fn list(
    State(state): State<HttpState>,
    _user: CurrentUser,
) -> AppResult<Json<Vec<TagCount>>> {
    let tags = state.services.tags.list_in_use().await?;
    Ok(Json(
        tags.into_iter()
            .map(|t| TagCount {
                name: t.name,
                count: t.count,
            })
            .collect(),
    ))
}
