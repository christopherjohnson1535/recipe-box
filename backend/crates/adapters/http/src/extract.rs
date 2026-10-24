use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use cookie::time;
use domain::User;

use crate::{HttpConfig, HttpState, error::AppError};

pub const COOKIE_NAME: &str = "rb_session";

/// The `rb_session` cookie for a new session.
pub fn session_cookie(config: &HttpConfig, token: String) -> Cookie<'static> {
    Cookie::build((COOKIE_NAME, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.cookie_secure)
        .max_age(time::Duration::days(config.session_days))
        .build()
}

/// A cookie that clears `rb_session`. `CookieJar::remove` sends nothing for a cookie the request did not carry,
/// so logout always adds this one.
pub fn removal_cookie() -> Cookie<'static> {
    let mut gone = Cookie::build(COOKIE_NAME).path("/").build();
    gone.make_removal();
    gone
}

/// The session token the request carries, if any.
pub fn session_token(jar: &CookieJar) -> Option<&str> {
    jar.get(COOKIE_NAME).map(|c| c.value())
}

/// The signed-in user; rejects with 401 `unauthenticated` when the session is missing or expired.
#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

/// A signed-in admin; 401 without a session, 403 `forbidden` for members.
#[derive(Debug, Clone)]
pub struct AdminUser(pub User);

impl<S> FromRequestParts<S> for CurrentUser
where
    HttpState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let http = HttpState::from_ref(state);
        let jar = CookieJar::from_headers(&parts.headers);
        let token = session_token(&jar).ok_or(AppError::SIGN_IN)?;
        let user = http
            .services
            .auth
            .current_user(token)
            .await?
            .ok_or(AppError::SIGN_IN)?;
        Ok(Self(user))
    }
}

impl<S> FromRequestParts<S> for AdminUser
where
    HttpState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let CurrentUser(user) = CurrentUser::from_request_parts(parts, state).await?;
        if !user.is_admin() {
            return Err(AppError::Forbidden("Only an admin can do that.".into()));
        }
        Ok(Self(user))
    }
}
