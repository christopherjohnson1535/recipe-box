use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    HttpState,
    dto::User,
    error::{AppJson, AppResult, ErrorBody},
    extract::session_cookie,
};

#[derive(serde::Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    needs_setup: bool,
}

/// Whether the first admin still has to be created.
#[utoipa::path(get, path = "/api/setup", operation_id = "getSetupStatus", tag = "setup", responses(
    (status = 200, description = "Setup status.", body = SetupStatus),
))]
pub async fn status(State(state): State<HttpState>) -> AppResult<Json<SetupStatus>> {
    Ok(Json(SetupStatus {
        needs_setup: state.services.users.needs_setup().await?,
    }))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetupBody {
    username: String,
    display_name: String,
    password: String,
}

/// Creates the first admin and signs them in. Only allowed while there are no users.
#[utoipa::path(post, path = "/api/setup", operation_id = "createAdmin", tag = "setup", request_body = SetupBody, responses(
    (status = 201, description = "Admin created and signed in.", body = User,
        headers(("Set-Cookie" = String, description = "The `rb_session` cookie."))),
    (status = 400, description = "Invalid username, display name or password (`validation`).", body = ErrorBody),
    (status = 403, description = "Setup is already done (`forbidden`).", body = ErrorBody),
))]
pub async fn create_admin(
    State(state): State<HttpState>,
    jar: CookieJar,
    AppJson(body): AppJson<SetupBody>,
) -> AppResult<(StatusCode, CookieJar, Json<User>)> {
    let (user, session) = state
        .services
        .users
        .create_first_admin(&body.username, &body.display_name, body.password)
        .await?;
    let jar = jar.add(session_cookie(&state.config, session));
    Ok((StatusCode::CREATED, jar, Json(user.into())))
}
