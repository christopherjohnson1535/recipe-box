//! Cook together with AI (KIT-7): the suggested order to cook two to four recipes in. The rules are in
//! `app::CookPlanService`.

use axum::{Json, extract::State};

use crate::{
    HttpState,
    dto::{CookPlan, CookPlanRequest},
    error::{AppJson, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// Suggests the order to cook the recipes' steps in so they are ready together. Needs an AI provider. A suggestion
/// that does not add up comes back as the round-robin order (`source: roundRobin`) with a `reason`, never as an error.
#[utoipa::path(post, path = "/api/cook/plan", operation_id = "planCook", tag = "cook", security(("session" = [])), request_body = CookPlanRequest, responses(
    (status = 200, description = "The plan: every step of every recipe exactly once, in order.", body = CookPlan),
    (status = 400, description = "Fewer than two or more than four different recipes, or a malformed body (`validation`).", body = ErrorBody),
    (status = 404, description = "A recipe is missing or deleted (`not_found`).", body = ErrorBody),
    (status = 422, description = "No AI provider is configured (`ai_disabled`).", body = ErrorBody),
    (status = 429, description = "Too many plans in ten minutes for this member (`rate_limited`, with `Retry-After`).", body = ErrorBody),
    (status = 502, description = "The AI provider failed or timed out (`ai_error`).", body = ErrorBody),
))]
pub async fn plan(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppJson(body): AppJson<CookPlanRequest>,
) -> AppResult<Json<CookPlan>> {
    let plan = state
        .services
        .cook_plan
        .plan(user.id, &body.recipe_ids, body.serve_at)
        .await?;
    Ok(Json(plan.into()))
}
