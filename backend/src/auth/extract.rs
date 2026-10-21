use axum::{extract::FromRequestParts, http::request::Parts};
use axum_extra::extract::cookie::CookieJar;

use super::session::{COOKIE_NAME, hash_token};
use crate::{error::AppError, models::User, state::AppState, user_columns};

/// The signed-in user; rejects with 401 `unauthenticated` when the session is missing or expired.
#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

/// A signed-in admin; 401 without a session, 403 `forbidden` for members.
#[derive(Debug, Clone)]
pub struct AdminUser(pub User);

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar.get(COOKIE_NAME).ok_or(AppError::SIGN_IN)?;
        let user = sqlx::query_as::<_, User>(concat!(
            "select ",
            user_columns!(),
            " from users where id = (select user_id from sessions where token_hash = $1 and expires_at > now())"
        ))
        .bind(hash_token(token.value()))
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::SIGN_IN)?;
        Ok(Self(user))
    }
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let CurrentUser(user) = CurrentUser::from_request_parts(parts, state).await?;
        if !user.is_admin() {
            return Err(AppError::Forbidden("Only an admin can do that.".into()));
        }
        Ok(Self(user))
    }
}
