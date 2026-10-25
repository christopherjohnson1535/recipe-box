//! Sign in with Google for existing members (ACC-6): which providers are on, the two redirects of the OpenID Connect
//! flow, and the Google accounts a member has linked. Every rule is in `app::SignInService`; this reads the query,
//! keeps the `rb_oauth` cookie and picks the page to land on. No code, token or secret is ever put in an address.

use app::{Callback, SignInOutcome};
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use uuid::Uuid;

use super::integrations::{clear_flow_cookie, flow_cookie, found, member};
use crate::{
    HttpState,
    dto::{AuthProviders, Identity},
    error::{AppError, AppPath, AppQuery, AppResult, ErrorBody},
    extract::{CurrentUser, session_cookie},
};

const FLOW_COOKIE: &str = "rb_oauth";
const FLOW_PATH: &str = "/api/auth/google";
const FLOW_MINUTES: i64 = 10;

/// Which sign-in methods besides the password this server offers. The login page shows its Google button from this.
#[utoipa::path(get, path = "/api/auth/providers", operation_id = "getAuthProviders", tag = "auth", security(()), responses(
    (status = 200, description = "The providers.", body = AuthProviders),
))]
pub async fn providers(State(state): State<HttpState>) -> Json<AuthProviders> {
    Json(AuthProviders {
        google: state.services.signin.enabled(),
    })
}

#[derive(Debug, Deserialize)]
pub struct StartQuery {
    /// Where to go after signing in: a path on this site; anything else is `/`.
    next: Option<String>,
    /// `1` to link a Google account to the signed-in member instead of signing in.
    link: Option<String>,
}

/// Starts signing in with Google. Open it as a page (a browser navigation), not with `fetch`. With `link=1` and a
/// session it links a Google account to that member instead; they need not share an email.
#[utoipa::path(get, path = "/api/auth/google/start", operation_id = "startGoogleSignIn", tag = "auth", security(()),
    params(
        ("next" = Option<String>, Query, description = "A path on this site to land on after signing in (anything else becomes `/`)."),
        ("link" = Option<String>, Query, description = "`1` links a Google account to the signed-in member instead of signing in."),
    ), responses(
    (status = 302, description = "To Google (scopes `openid email profile`, PKCE S256, `state`, `nonce`, `prompt=select_account`), setting the `rb_oauth` cookie (httpOnly, SameSite=Lax, 10 minutes, path `/api/auth/google`). With `link=1` and no session: to `/login?next=/settings`, no cookie.",
        headers(("Location" = String, description = "Google's sign-in page, or `/login?next=/settings`."), ("Set-Cookie" = String, description = "`rb_oauth`, the sealed record of this sign-in."))),
    (status = 404, description = "Google sign-in is not set up on this server (`not_found`).", body = ErrorBody),
))]
pub async fn start(
    State(state): State<HttpState>,
    user: Result<CurrentUser, AppError>,
    jar: CookieJar,
    AppQuery(q): AppQuery<StartQuery>,
) -> AppResult<(CookieJar, Response)> {
    let signin = &state.services.signin;
    signin.ensure_enabled()?;
    let link_user = if q.link.as_deref() == Some("1") {
        match member(user)? {
            Some(CurrentUser(user)) => Some(user.id),
            None => return Ok((jar, found("/login?next=/settings"))),
        }
    } else {
        None
    };
    let started = signin.start(q.next.as_deref(), link_user)?;
    let cookie = flow_cookie(
        &state.config,
        FLOW_COOKIE,
        FLOW_PATH,
        started.flow,
        FLOW_MINUTES,
    );
    Ok((jar.add(cookie), found(started.url.as_str())))
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    /// Set by Google when the person said no (`access_denied`).
    error: Option<String>,
}

/// Where Google sends the browser back. Always clears `rb_oauth` and ends on a page, never on JSON.
///
/// Signing in: a member gets the session cookie (as the password login does) and lands on `next`; a Google account
/// that is no member lands on `/login?error=google_not_member` and nothing is created; any other failure (a wrong
/// or old `state`, a refusal from Google, an unverified email, a bad ID token) on `/login?error=google_failed`.
/// Linking from Settings (needs the session of the member who started it): `/settings?signin=linked`,
/// `/settings?signin=taken` (that Google account belongs to another member) or `/settings?signin=error`.
#[utoipa::path(get, path = "/api/auth/google/callback", operation_id = "googleSignInCallback", tag = "auth", security(()),
    params(
        ("code" = Option<String>, Query, description = "Google's authorisation code."),
        ("state" = Option<String>, Query, description = "Must equal the `state` sealed in the `rb_oauth` cookie."),
        ("error" = Option<String>, Query, description = "Set by Google when the person declined."),
    ), responses(
    (status = 302, description = "To `next` (a member signed in; sets `rb_session`), `/login?error=google_not_member`, `/login?error=google_failed`, or, when linking, `/settings?signin=linked`, `/settings?signin=taken` or `/settings?signin=error`. Clears `rb_oauth`.",
        headers(("Location" = String, description = "Where the browser lands."), ("Set-Cookie" = String, description = "Clears `rb_oauth`; on sign-in also sets `rb_session`."))),
    (status = 404, description = "Google sign-in is not set up on this server (`not_found`).", body = ErrorBody),
))]
pub async fn callback(
    State(state): State<HttpState>,
    user: Result<CurrentUser, AppError>,
    jar: CookieJar,
    AppQuery(q): AppQuery<CallbackQuery>,
) -> AppResult<(CookieJar, Response)> {
    let signed_in = member(user)?.map(|CurrentUser(user)| user.id);
    let cookie = jar.get(FLOW_COOKIE).map(|c| c.value().to_string());
    let jar = jar.add(clear_flow_cookie(FLOW_COOKIE, FLOW_PATH));
    let reply = Callback {
        code: q.code.as_deref(),
        state: q.state.as_deref(),
        error: q.error.as_deref(),
    };
    let outcome = match state
        .services
        .signin
        .finish(cookie.as_deref(), reply, signed_in)
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => return Ok((jar, AppError::from(e).into_response())),
    };
    Ok(match outcome {
        SignInOutcome::SignedIn { session, next } => (
            jar.add(session_cookie(&state.config, session)),
            found(&next),
        ),
        SignInOutcome::NotMember => (jar, found("/login?error=google_not_member")),
        SignInOutcome::Linked => (jar, found("/settings?signin=linked")),
        SignInOutcome::Taken => (jar, found("/settings?signin=taken")),
        SignInOutcome::Failed { link, error } => {
            if let Some(e) = error {
                tracing::warn!(error = %e, link, "Google sign-in did not go through");
            }
            let to = if link {
                "/settings?signin=error"
            } else {
                "/login?error=google_failed"
            };
            (jar, found(to))
        }
    })
}

/// The Google accounts linked to the signed-in member, oldest first.
#[utoipa::path(get, path = "/api/auth/identities", operation_id = "listIdentities", tag = "auth", security(("session" = [])), responses(
    (status = 200, description = "Your linked accounts.", body = Vec<Identity>),
))]
pub async fn identities(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<Vec<Identity>>> {
    let all = state.services.signin.identities(user.id).await?;
    Ok(Json(all.into_iter().map(Into::into).collect()))
}

/// Unlinks one of your Google accounts. The password keeps working.
#[utoipa::path(delete, path = "/api/auth/identities/{id}", operation_id = "deleteIdentity", tag = "auth", security(("session" = [])),
    params(("id" = Uuid, Path, description = "Linked account id")), responses(
    (status = 204, description = "Unlinked."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 404, description = "No such linked account, or it is someone else's (`not_found`).", body = ErrorBody),
))]
pub async fn unlink(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.signin.unlink(user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
