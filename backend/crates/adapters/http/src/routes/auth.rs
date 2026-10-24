use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    HttpState,
    dto::User,
    error::{AppJson, AppResult, ErrorBody},
    extract::{CurrentUser, removal_cookie, session_cookie, session_token},
};

#[derive(Deserialize, ToSchema)]
pub struct LoginBody {
    username: String,
    password: String,
}

/// Signs in with a username and password.
#[utoipa::path(post, path = "/api/auth/login", operation_id = "login", tag = "auth", request_body = LoginBody, responses(
    (status = 200, description = "Signed in.", body = User,
        headers(("Set-Cookie" = String, description = "The `rb_session` cookie."))),
    (status = 400, description = "Malformed body (`validation`).", body = ErrorBody),
    (status = 401, description = "Wrong username or password; the same answer for both (`unauthenticated`).", body = ErrorBody),
))]
pub async fn login(
    State(state): State<HttpState>,
    jar: CookieJar,
    AppJson(body): AppJson<LoginBody>,
) -> AppResult<(CookieJar, Json<User>)> {
    let (user, session) = state
        .services
        .auth
        .login(&body.username, body.password)
        .await?;
    let jar = jar.add(session_cookie(&state.config, session.token));
    Ok((jar, Json(user.into())))
}

/// Always succeeds, even without a session.
#[utoipa::path(post, path = "/api/auth/logout", operation_id = "logout", tag = "auth", responses(
    (status = 204, description = "Session deleted and cookie cleared.",
        headers(("Set-Cookie" = String, description = "Clears `rb_session`."))),
))]
pub async fn logout(
    State(state): State<HttpState>,
    jar: CookieJar,
) -> AppResult<(StatusCode, CookieJar)> {
    state.services.auth.logout(session_token(&jar)).await?;
    Ok((StatusCode::NO_CONTENT, jar.add(removal_cookie())))
}

/// The signed-in user.
#[utoipa::path(get, path = "/api/auth/me", operation_id = "getCurrentUser", tag = "auth", security(("session" = [])), responses(
    (status = 200, description = "The current user.", body = User),
))]
pub async fn me(CurrentUser(user): CurrentUser) -> Json<User> {
    Json(user.into())
}
