use app::NewSession;
use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use cookie::time;
use domain::User;

use crate::{HttpConfig, HttpState, error::AppError};

pub const COOKIE_NAME: &str = "rb_session";

/// The `rb_session` cookie for a new session; it lives as long as the session row (`Max-Age` in seconds).
pub fn session_cookie(config: &HttpConfig, session: NewSession) -> Cookie<'static> {
    Cookie::build((COOKIE_NAME, session.token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.cookie_secure)
        .max_age(time::Duration::seconds(session.lifetime.num_seconds()))
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

#[cfg(test)]
mod tests {
    use domain::chrono::{Duration, Utc};

    use super::*;

    fn session() -> NewSession {
        NewSession {
            token: "tok".into(),
            expires_at: Utc::now(),
            lifetime: Duration::days(30),
        }
    }

    fn config(cookie_secure: bool) -> HttpConfig {
        HttpConfig {
            cookie_secure,
            max_upload_bytes: 1,
            max_backup_bytes: 1,
            version: "test",
        }
    }

    #[test]
    fn the_session_cookie_has_the_agreed_attributes() {
        let c = session_cookie(&config(false), session()).to_string();
        assert_eq!(
            c,
            "rb_session=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000"
        );
    }

    #[test]
    fn the_secure_flag_follows_the_config() {
        let on = session_cookie(&config(true), session()).to_string();
        assert!(on.contains("; Secure"), "{on}");
        let off = session_cookie(&config(false), session()).to_string();
        assert!(!off.contains("Secure"), "{off}");
    }

    #[test]
    fn the_removal_cookie_clears_rb_session_everywhere() {
        let c = removal_cookie().to_string();
        assert!(c.starts_with("rb_session=;"), "{c}");
        assert!(c.contains("Path=/") && c.contains("Max-Age=0"), "{c}");
    }
}
