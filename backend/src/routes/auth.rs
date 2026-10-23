use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    auth::{CurrentUser, password, session},
    error::{AppError, AppJson, AppResult, ErrorBody},
    models::User,
    state::AppState,
    user_columns, validate,
};

#[derive(Deserialize, ToSchema)]
pub struct LoginBody {
    username: String,
    password: String,
}

#[derive(sqlx::FromRow)]
struct UserWithHash {
    #[sqlx(flatten)]
    user: User,
    password_hash: String,
}

/// Signs in with a username and password.
#[utoipa::path(post, path = "/api/auth/login", operation_id = "login", tag = "auth", request_body = LoginBody, responses(
    (status = 200, description = "Signed in.", body = User,
        headers(("Set-Cookie" = String, description = "The `rb_session` cookie."))),
    (status = 400, description = "Malformed body (`validation`).", body = ErrorBody),
    (status = 401, description = "Wrong username or password; the same answer for both (`unauthenticated`).", body = ErrorBody),
))]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    AppJson(body): AppJson<LoginBody>,
) -> AppResult<(CookieJar, Json<User>)> {
    // A longer password can never have been set; refuse before any argon2 work.
    if body.password.chars().count() > validate::MAX_PASSWORD {
        return Err(AppError::Unauthenticated("Wrong username or password."));
    }
    let found = sqlx::query_as::<_, UserWithHash>(concat!(
        "select ",
        user_columns!(),
        ", password_hash from users where username = $1::citext"
    ))
    .bind(body.username.trim())
    .fetch_optional(&state.pool)
    .await?;
    let (user, hash) = match found {
        Some(f) => (Some(f.user), Some(f.password_hash)),
        None => (None, None),
    };
    let ok = password::verify(body.password, hash).await?;
    let Some(user) = user.filter(|_| ok) else {
        // Same answer for unknown user and wrong password.
        return Err(AppError::Unauthenticated("Wrong username or password."));
    };
    let jar = session::start(&state, jar, user.id).await?;
    Ok((jar, Json(user)))
}

/// Always succeeds, even without a session.
#[utoipa::path(post, path = "/api/auth/logout", operation_id = "logout", tag = "auth", responses(
    (status = 204, description = "Session deleted and cookie cleared.",
        headers(("Set-Cookie" = String, description = "Clears `rb_session`."))),
))]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<(StatusCode, CookieJar)> {
    let jar = session::end(&state.pool, jar).await?;
    Ok((StatusCode::NO_CONTENT, jar))
}

/// The signed-in user.
#[utoipa::path(get, path = "/api/auth/me", operation_id = "getCurrentUser", tag = "auth", security(("session" = [])), responses(
    (status = 200, description = "The current user.", body = User),
))]
pub async fn me(CurrentUser(user): CurrentUser) -> Json<User> {
    Json(user)
}
