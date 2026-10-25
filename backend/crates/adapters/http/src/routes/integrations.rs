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
use domain::constant_time_eq;
use serde::Deserialize;

use crate::{
    HttpState,
    dto::GoogleStatus,
    error::{AppError, AppQuery, AppResult, ErrorBody},
    extract::CurrentUser,
};

const STATE_COOKIE: &str = "rb_google_state";
const STATE_PATH: &str = "/api/integrations/google";
const STATE_MINUTES: i64 = 10;

/// A short-lived cookie for an OAuth round trip (`name` at `path`): httpOnly, SameSite=Lax so it comes back with
/// Google's redirect, always Secure (browsers keep Secure cookies on `http://localhost` too; Google only redirects
/// to HTTPS or localhost), gone after `minutes`.
pub(crate) fn flow_cookie(
    name: &'static str,
    path: &'static str,
    value: String,
    minutes: i64,
) -> Cookie<'static> {
    Cookie::build((name, value))
        .path(path)
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(true)
        .max_age(time::Duration::minutes(minutes))
        .build()
}

/// The cookie that clears `name` at `path`.
pub(crate) fn clear_flow_cookie(name: &'static str, path: &'static str) -> Cookie<'static> {
    let mut gone = Cookie::build(name).path(path).secure(true).build();
    gone.make_removal();
    gone
}

fn state_cookie(state: String) -> Cookie<'static> {
    flow_cookie(STATE_COOKIE, STATE_PATH, state, STATE_MINUTES)
}

fn clear_state_cookie() -> Cookie<'static> {
    clear_flow_cookie(STATE_COOKIE, STATE_PATH)
}

/// A plain `302 Found`, which is what the contract says (axum's own redirects are 303 and 307).
pub(crate) fn found(location: &str) -> Response {
    (
        StatusCode::FOUND,
        [(header::LOCATION, location.to_string())],
    )
        .into_response()
}

/// The signed-in member, or `None` for a missing or expired session; any other failure stays an error. The connect and
/// callback routes are page navigations, so they answer a signed-out visitor with a redirect, not JSON.
pub(crate) fn member(user: Result<CurrentUser, AppError>) -> AppResult<Option<CurrentUser>> {
    match user {
        Ok(user) => Ok(Some(user)),
        Err(AppError::Unauthenticated(_)) => Ok(None),
        Err(e) => Err(e),
    }
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
    (status = 302, description = "To Google's consent page, setting the `rb_google_state` cookie (httpOnly, SameSite=Lax, 10 minutes). Without a session: to `/login?next=/settings`, no cookie.",
        headers(("Location" = String, description = "Google's consent page, or `/login?next=/settings`."), ("Set-Cookie" = String, description = "`rb_google_state`, the random `state` sent to Google."))),
    (status = 422, description = "Google Tasks is not set up on this server (`google_disabled`).", body = ErrorBody),
))]
pub async fn connect(
    State(state): State<HttpState>,
    user: Result<CurrentUser, AppError>,
    jar: CookieJar,
) -> AppResult<(CookieJar, Response)> {
    if member(user)?.is_none() {
        return Ok((jar, found("/login?next=/settings")));
    }
    let (url, random) = state.services.google.consent()?;
    Ok((jar.add(state_cookie(random)), found(url.as_str())))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    /// Set by Google when the member said no (`access_denied`).
    error: Option<String>,
}

/// Where Google sends the browser back. Always ends on the settings page with `?google=connected` or
/// `?google=error`; no token is ever put in the address. Without a session (an in-app browser that does not share the
/// app's cookies) nothing is exchanged: it ends on `?google=error`.
#[utoipa::path(get, path = "/api/integrations/google/callback", operation_id = "googleCallback", tag = "integrations", security(("session" = [])),
    params(
        ("code" = Option<String>, Query, description = "Google's authorisation code."),
        ("state" = Option<String>, Query, description = "Must equal the `rb_google_state` cookie."),
        ("error" = Option<String>, Query, description = "Set by Google when the member declined."),
    ), responses(
    (status = 302, description = "To `/settings?google=connected`, or `/settings?google=error` when anything went wrong, also without a session (nothing is stored then). Clears the `rb_google_state` cookie.",
        headers(("Location" = String, description = "`/settings?google=connected` or `/settings?google=error`."), ("Set-Cookie" = String, description = "Clears `rb_google_state`."))),
))]
pub async fn callback(
    State(state): State<HttpState>,
    user: Result<CurrentUser, AppError>,
    jar: CookieJar,
    AppQuery(q): AppQuery<CallbackQuery>,
) -> AppResult<(CookieJar, Response)> {
    let user = member(user)?;
    let expected = jar.get(STATE_COOKIE).map(|c| c.value().to_string());
    let jar = jar.add(clear_state_cookie());
    let checked = match (&user, &q.error, &q.state, &expected, &q.code) {
        (Some(_), None, Some(got), Some(want), Some(code)) if constant_time_eq(got, want) => {
            Some(code)
        }
        _ => None,
    };
    let connected = match (&user, checked) {
        (Some(CurrentUser(user)), Some(code)) => {
            match state.services.google.finish(user.id, code).await {
                Ok(()) => true,
                Err(e) => {
                    tracing::warn!(error = %e, "could not connect a Google account");
                    false
                }
            }
        }
        _ => false,
    };
    let to = if connected {
        "/settings?google=connected"
    } else {
        "/settings?google=error"
    };
    Ok((jar, found(to)))
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
    fn the_state_cookie_has_the_agreed_attributes() {
        assert_eq!(
            state_cookie("s".into()).to_string(),
            "rb_google_state=s; HttpOnly; SameSite=Lax; Secure; Path=/api/integrations/google; Max-Age=600"
        );
    }
}
