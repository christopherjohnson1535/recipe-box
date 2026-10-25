//! Connecting a member's Google account (GRO-5). The refresh token stays in the API: these routes only start the
//! sign-in, finish it, report it and undo it.

use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use cookie::time;
use serde::Deserialize;

use crate::{
    HttpConfig, HttpState,
    dto::GoogleStatus,
    error::{AppQuery, AppResult, ErrorBody},
    extract::CurrentUser,
};

const STATE_COOKIE: &str = "rb_google_state";
const STATE_PATH: &str = "/api/integrations/google";
const STATE_MINUTES: i64 = 10;

fn state_cookie(config: &HttpConfig, state: String) -> Cookie<'static> {
    Cookie::build((STATE_COOKIE, state))
        .path(STATE_PATH)
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.cookie_secure)
        .max_age(time::Duration::minutes(STATE_MINUTES))
        .build()
}

fn clear_state_cookie() -> Cookie<'static> {
    let mut gone = Cookie::build(STATE_COOKIE).path(STATE_PATH).build();
    gone.make_removal();
    gone
}

/// A plain `302 Found`, which is what the contract says (axum's own redirects are 303 and 307).
fn found(location: &str) -> Response {
    (
        StatusCode::FOUND,
        [(header::LOCATION, location.to_string())],
    )
        .into_response()
}

/// Equal strings, in time that depends on their length only.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0, |d, (x, y)| d | (x ^ y)) == 0
}

/// Whether this member can send the list to Google Tasks.
#[utoipa::path(get, path = "/api/integrations/google", operation_id = "getGoogleStatus", tag = "integrations", security(("session" = [])), responses(
    (status = 200, description = "The status.", body = GoogleStatus),
))]
pub async fn status(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<GoogleStatus>> {
    Ok(Json(state.services.google.status(user.id).await?.into()))
}

/// Starts connecting a Google account. Open it as a page (a browser navigation), not with `fetch`.
#[utoipa::path(get, path = "/api/integrations/google/connect", operation_id = "connectGoogle", tag = "integrations", security(("session" = [])), responses(
    (status = 302, description = "To Google's consent page. Sets the `rb_google_state` cookie (httpOnly, SameSite=Lax, 10 minutes).",
        headers(("Location" = String, description = "Google's consent page."), ("Set-Cookie" = String, description = "`rb_google_state`, the random `state` sent to Google."))),
    (status = 422, description = "Google Tasks is not set up on this server (`google_disabled`).", body = ErrorBody),
))]
pub async fn connect(
    State(state): State<HttpState>,
    _user: CurrentUser,
    jar: CookieJar,
) -> AppResult<(CookieJar, Response)> {
    let (url, random) = state.services.google.consent()?;
    Ok((
        jar.add(state_cookie(&state.config, random)),
        found(url.as_str()),
    ))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    /// Set by Google when the member said no (`access_denied`).
    error: Option<String>,
}

/// Where Google sends the browser back. Always ends on the settings page with `?google=connected` or
/// `?google=error`; no token is ever put in the address.
#[utoipa::path(get, path = "/api/integrations/google/callback", operation_id = "googleCallback", tag = "integrations", security(("session" = [])),
    params(
        ("code" = Option<String>, Query, description = "Google's authorisation code."),
        ("state" = Option<String>, Query, description = "Must equal the `rb_google_state` cookie."),
        ("error" = Option<String>, Query, description = "Set by Google when the member declined."),
    ), responses(
    (status = 302, description = "To `/settings?google=connected`, or `/settings?google=error` when anything went wrong (nothing is stored then). Clears the `rb_google_state` cookie.",
        headers(("Location" = String, description = "`/settings?google=connected` or `/settings?google=error`."), ("Set-Cookie" = String, description = "Clears `rb_google_state`."))),
))]
pub async fn callback(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    jar: CookieJar,
    AppQuery(q): AppQuery<CallbackQuery>,
) -> (CookieJar, Response) {
    let expected = jar.get(STATE_COOKIE).map(|c| c.value().to_string());
    let jar = jar.add(clear_state_cookie());
    let checked = match (&q.error, &q.state, &expected, &q.code) {
        (None, Some(got), Some(want), Some(code)) if same(got, want) => Some(code),
        _ => None,
    };
    let connected = match checked {
        Some(code) => match state.services.google.finish(user.id, code).await {
            Ok(not_revoked) => {
                if let Some(e) = not_revoked {
                    tracing::warn!(error = %e, "the replaced Google token was not revoked");
                }
                true
            }
            Err(e) => {
                tracing::warn!(error = %e, "could not connect a Google account");
                false
            }
        },
        None => false,
    };
    let to = if connected {
        "/settings?google=connected"
    } else {
        "/settings?google=error"
    };
    (jar, found(to))
}

/// Revokes the token at Google (best effort) and forgets the connection and its task list.
#[utoipa::path(delete, path = "/api/integrations/google", operation_id = "disconnectGoogle", tag = "integrations", security(("session" = [])), responses(
    (status = 204, description = "Disconnected. Also when nothing was connected, or Google could not be reached to revoke."),
))]
pub async fn disconnect(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<StatusCode> {
    if let Some(e) = state.services.google.disconnect(user.id).await? {
        tracing::warn!(error = %e, "Google token not revoked; the connection was removed anyway");
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_compares_whole_strings() {
        assert!(same("abc", "abc"));
        assert!(!same("abc", "abd"));
        assert!(!same("abc", "ab"));
        assert!(!same("", "a"));
        assert!(same("", ""));
    }

    #[test]
    fn the_state_cookie_has_the_agreed_attributes() {
        let config = HttpConfig {
            cookie_secure: true,
            max_upload_bytes: 1,
            max_backup_bytes: 1,
            version: "test",
        };
        assert_eq!(
            state_cookie(&config, "s".into()).to_string(),
            "rb_google_state=s; HttpOnly; SameSite=Lax; Secure; Path=/api/integrations/google; Max-Age=600"
        );
    }
}
