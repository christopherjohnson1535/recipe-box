use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use cookie::time;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{error::AppResult, state::AppState};

pub const COOKIE_NAME: &str = "rb_session";

/// A random 32-byte token, base64url. Only its SHA-256 goes to the database.
pub fn new_token() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Creates a session row for `user_id` and returns the cookie jar with `rb_session` set.
pub async fn start(state: &AppState, jar: CookieJar, user_id: Uuid) -> AppResult<CookieJar> {
    let config = &state.config;
    let token = new_token();
    let expires_at = state.clock.now() + chrono::Duration::days(config.session_days);
    state
        .sessions
        .create(user_id, hash_token(&token), expires_at)
        .await?;
    let cookie = Cookie::build((COOKIE_NAME, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.cookie_secure)
        .max_age(time::Duration::days(config.session_days));
    Ok(jar.add(cookie))
}

/// Deletes the session behind the cookie (if any) and clears the cookie.
pub async fn end(state: &AppState, jar: CookieJar) -> AppResult<CookieJar> {
    if let Some(c) = jar.get(COOKIE_NAME) {
        state.sessions.delete(&hash_token(c.value())).await?;
    }
    // `jar.remove` sends nothing for a cookie the request did not carry; always send the expiry.
    let mut gone = Cookie::build(COOKIE_NAME).path("/").build();
    gone.make_removal();
    Ok(jar.add(gone))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_random_and_hashed() {
        let (a, b) = (new_token(), new_token());
        assert_ne!(a, b);
        assert_eq!(URL_SAFE_NO_PAD.decode(&a).unwrap().len(), 32);
        assert_eq!(hash_token(&a).len(), 32);
        assert_eq!(hash_token(&a), hash_token(&a));
        assert_ne!(hash_token(&a), hash_token(&b));
        // SHA-256("abc")
        assert_eq!(hash_token("abc")[..4], [0xba, 0x78, 0x16, 0xbf]);
    }
}
