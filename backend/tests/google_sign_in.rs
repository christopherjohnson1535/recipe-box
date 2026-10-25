//! Sign in with Google (ACC-6) over HTTP against a real Postgres and a fake identity provider
//! (`common/idp.rs`): the whole OpenID Connect flow, every check on the ID token, who gets in and who does not,
//! linking from Settings, and the member's email. The rules of who matches whom are also tested in
//! `crates/app/tests/signin.rs`; this file checks the routes, cookies, redirects and the adapter's token checks.

mod common;

use std::collections::HashMap;

use axum::http::{Method, StatusCode};
use common::{
    MEMBER_PASSWORD, Res, TestApp, a_user,
    idp::{CLIENT_ID, FakeIdp, Id, REDIRECT_URI},
};
use serde_json::{Value, json};
use url::Url;

async fn app() -> (TestApp, FakeIdp) {
    let idp = FakeIdp::start().await;
    let app = TestApp::spawn_as_admin_with(|s| idp.enable(s)).await;
    (app, idp)
}

/// A sign-in the app started: what Google was sent and the cookie the browser keeps meanwhile.
struct Started {
    res: Res,
    sent: HashMap<String, String>,
    /// `rb_oauth=<sealed>`
    flow: String,
}

impl Started {
    fn state(&self) -> &str {
        &self.sent["state"]
    }

    fn nonce(&self) -> &str {
        &self.sent["nonce"]
    }

    fn challenge(&self) -> &str {
        &self.sent["code_challenge"]
    }
}

async fn start(ctx: &TestApp, path: &str, session: Option<&str>) -> Started {
    let res = ctx.call(Method::GET, path, session, None).await;
    res.assert_status(StatusCode::FOUND);
    let location = Url::parse(res.location.as_deref().expect("a Location")).unwrap();
    let sent = location.query_pairs().into_owned().collect();
    let flow = res
        .cookie_named("rb_oauth")
        .expect("the rb_oauth cookie")
        .split(';')
        .next()
        .unwrap()
        .to_string();
    Started { res, sent, flow }
}

/// Google's redirect back, as the browser makes it: `flow` and (maybe) a session as cookies.
async fn back(ctx: &TestApp, query: &str, cookies: &[&str]) -> Res {
    let cookie = (!cookies.is_empty()).then(|| cookies.join("; "));
    ctx.call(
        Method::GET,
        &format!("/api/auth/google/callback?{query}"),
        cookie.as_deref(),
        None,
    )
    .await
}

/// A whole trip: start, Google answers with `id_token(nonce)`, the browser comes back with the right `state`.
async fn trip(
    ctx: &TestApp,
    idp: &FakeIdp,
    next: Option<&str>,
    id_token: impl FnOnce(&str) -> String,
) -> Res {
    let path = match next {
        Some(n) => format!("/api/auth/google/start?next={}", encode(n)),
        None => "/api/auth/google/start".into(),
    };
    let s = start(ctx, &path, None).await;
    let code = idp.code_for(s.challenge(), id_token(s.nonce()));
    back(ctx, &format!("code={code}&state={}", s.state()), &[&s.flow]).await
}

/// `back` as a request that came over TCP from `peer` (`"203.0.113.9:4000"`), so the address can be throttled.
async fn back_from(ctx: &TestApp, peer: &str, query: &str, cookies: &[&str]) -> Res {
    let mut req = axum::http::Request::builder()
        .method(Method::GET)
        .uri(format!("/api/auth/google/callback?{query}"));
    if !cookies.is_empty() {
        req = req.header(axum::http::header::COOKIE, cookies.join("; "));
    }
    let mut req = req.body(axum::body::Body::empty()).unwrap();
    let peer: std::net::SocketAddr = peer.parse().unwrap();
    req.extensions_mut()
        .insert(axum::extract::ConnectInfo(peer));
    ctx.send(req).await
}

fn encode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

async fn member(ctx: &TestApp, username: &str, email: Option<&str>) -> Value {
    let mut user = a_user().named(username);
    if let Some(e) = email {
        user = user.email(e);
    }
    ctx.create_user(&ctx.cookie, user).await
}

async fn count(ctx: &TestApp, table: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("select count(*) from {table}")))
        .fetch_one(&ctx.pool)
        .await
        .unwrap()
}

/// A failed sign-in: back on the login page with `error`, no session, the flow cookie cleared.
#[track_caller]
fn assert_login_error(res: &Res, error: &str) {
    assert_eq!(res.status, StatusCode::FOUND);
    assert_eq!(
        res.location.as_deref(),
        Some(format!("/login?error={error}").as_str())
    );
    assert!(
        res.cookie_named("rb_session").is_none(),
        "{:?}",
        res.cookies
    );
    assert_flow_cleared(res);
}

#[track_caller]
fn assert_flow_cleared(res: &Res) {
    let c = res.cookie_named("rb_oauth").unwrap_or("");
    assert!(
        c.starts_with("rb_oauth=;")
            && c.contains("Path=/api/auth/google")
            && c.contains("Max-Age=0"),
        "{c}"
    );
}

#[tokio::test]
async fn providers_say_whether_google_is_on_without_a_session() {
    let (on, _) = app().await;
    let res = on
        .call(Method::GET, "/api/auth/providers", None, None)
        .await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json, json!({ "google": true }));

    let off = TestApp::spawn_as_admin().await;
    let res = off
        .call(Method::GET, "/api/auth/providers", None, None)
        .await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json, json!({ "google": false }));
}

#[tokio::test]
async fn without_google_the_sign_in_routes_do_not_exist_and_the_rest_runs() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    for path in [
        "/api/auth/google/start",
        "/api/auth/google/start?link=1",
        "/api/auth/google/start?next=%2Frecipes",
        "/api/auth/google/callback?code=c&state=s",
        "/api/auth/google/callback?error=access_denied",
    ] {
        for cookie in [None, Some(c)] {
            let res = ctx.call(Method::GET, path, cookie, None).await;
            res.assert_error(StatusCode::NOT_FOUND, "not_found");
            assert!(res.location.is_none(), "{path}");
            // The callback clears the flow cookie whatever happens; nothing else is ever set.
            assert!(
                res.cookie.is_none() || res.cookie_named("rb_oauth").is_some(),
                "{path}"
            );
            assert!(res.cookie_named("rb_session").is_none(), "{path}");
        }
    }
    // Passwords, linked accounts and the rest work as before.
    ctx.get("/api/auth/me", c)
        .await
        .assert_status(StatusCode::OK);
    let list = ctx.get("/api/auth/identities", c).await;
    list.assert_status(StatusCode::OK);
    assert_eq!(list.json, json!([]));
}

#[tokio::test]
async fn starting_sends_the_browser_to_google_with_state_nonce_and_pkce() {
    let (ctx, _) = app().await;
    let s = start(&ctx, "/api/auth/google/start?next=%2Frecipes", None).await;
    let loc = s.res.location.as_deref().unwrap();
    assert!(
        loc.starts_with("https://accounts.test/o/oauth2/v2/auth?"),
        "{loc}"
    );
    for (k, v) in [
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("code_challenge_method", "S256"),
        ("prompt", "select_account"),
    ] {
        assert_eq!(s.sent.get(k).map(String::as_str), Some(v), "{k}");
    }
    assert!(s.state().len() >= 32 && s.nonce().len() >= 32 && s.challenge().len() == 43);
    assert_ne!(s.state(), s.nonce());
    assert!(
        !loc.contains("idp-client-secret") && !loc.contains("rb_oauth"),
        "no secret in the address: {loc}"
    );

    let cookie = s.res.cookie_named("rb_oauth").unwrap();
    for part in [
        "HttpOnly",
        "SameSite=Lax",
        "Secure",
        "Path=/api/auth/google",
        "Max-Age=600",
    ] {
        assert!(cookie.contains(part), "{part}: {cookie}");
    }
    assert!(
        !cookie.contains(s.state()) && !cookie.contains(s.nonce()),
        "the record is sealed: {cookie}"
    );
    // Every start has its own secrets.
    let again = start(&ctx, "/api/auth/google/start", None).await;
    assert!(
        again.state() != s.state() && again.challenge() != s.challenge() && again.flow != s.flow
    );
}

#[tokio::test]
async fn the_flow_cookie_is_secure_when_the_site_is() {
    let idp = FakeIdp::start().await;
    let ctx = TestApp::spawn_as_admin_with(|s| {
        std::sync::Arc::make_mut(&mut s.config).cookie_secure = true;
        idp.enable(s);
    })
    .await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    assert!(s.res.cookie_named("rb_oauth").unwrap().contains("; Secure"));
}

#[tokio::test]
async fn a_member_with_the_matching_email_signs_in_and_stays_signed_in() {
    let (ctx, idp) = app().await;
    let sam = member(&ctx, "sam", Some("Sam@Example.com")).await;
    assert_eq!(
        sam["email"], "sam@example.com",
        "stored trimmed and lower-cased"
    );

    let res = trip(&ctx, &idp, Some("/recipes/42"), |nonce| {
        Id::new("sub-sam", "sam@example.com", nonce).mint()
    })
    .await;
    assert_eq!(res.status, StatusCode::FOUND);
    assert_eq!(res.location.as_deref(), Some("/recipes/42"));
    assert_flow_cleared(&res);
    let session = res.cookie_named("rb_session").expect("a session");
    for part in ["HttpOnly", "SameSite=Lax", "Max-Age=2592000", "Path=/"] {
        assert!(session.contains(part), "{part}: {session}");
    }
    let pair = session.split(';').next().unwrap();
    let me = ctx.get("/api/auth/me", pair).await;
    me.assert_status(StatusCode::OK);
    assert_eq!(
        (me.json["username"].as_str(), me.json["id"].clone()),
        (Some("sam"), sam["id"].clone())
    );

    // The link is stored, and the list shows it to the member.
    let list = ctx.get("/api/auth/identities", pair).await;
    list.assert_status(StatusCode::OK);
    let links = list.json.as_array().unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(
        (links[0]["provider"].as_str(), links[0]["email"].as_str()),
        (Some("google"), Some("sam@example.com"))
    );
    assert!(links[0]["id"].is_string() && links[0]["createdAt"].is_string());
    assert!(links[0].get("subject").is_none(), "{}", links[0]);

    // What Google was sent: the client secret and the PKCE verifier, in the body.
    let reqs = idp.token_requests();
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0]["grant_type"], "authorization_code");
    assert_eq!(reqs[0]["redirect_uri"], REDIRECT_URI);
    assert!(reqs[0]["code_verifier"].len() >= 43);
}

#[tokio::test]
async fn the_second_sign_in_uses_the_link_even_after_the_google_address_changed() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let first = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    assert!(first.cookie_named("rb_session").is_some());

    // Sam's Google account changed its address; the link is by account, not by address.
    let again = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@renamed.example", n).mint()
    })
    .await;
    assert_eq!(again.location.as_deref(), Some("/"));
    let pair = again
        .cookie_named("rb_session")
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string();
    assert_eq!(ctx.get("/api/auth/me", &pair).await.json["username"], "sam");
    assert_eq!(
        count(&ctx, "user_identities").await,
        1,
        "still the one link"
    );
}

#[tokio::test]
async fn a_google_account_that_is_no_member_gets_nothing_and_creates_nothing() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let (users, links) = (
        count(&ctx, "users").await,
        count(&ctx, "user_identities").await,
    );

    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-stranger", "stranger@example.com", n).mint()
    })
    .await;
    assert_login_error(&res, "google_not_member");
    assert_eq!(
        (
            count(&ctx, "users").await,
            count(&ctx, "user_identities").await
        ),
        (users, links)
    );

    // A member without an email is not reachable by email either.
    member(&ctx, "alex", None).await;
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-alex", "alex@example.com", n).mint()
    })
    .await;
    assert_login_error(&res, "google_not_member");
    assert_eq!(count(&ctx, "user_identities").await, links);
}

#[tokio::test]
async fn a_wrong_state_or_a_missing_or_made_up_cookie_is_refused_before_google_is_asked() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    let other = start(&ctx, "/api/auth/google/start", None).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );

    // state of another sign-in; no state; a state with a character changed
    let q = |state: &str| format!("code={code}&state={state}");
    for query in [
        q(other.state()),
        format!("code={code}"),
        q(&format!("{}x", s.state())),
        q(""),
    ] {
        assert_login_error(&back(&ctx, &query, &[&s.flow]).await, "google_failed");
    }
    // the cookie of another sign-in, no cookie, a cookie from nowhere, an empty one
    for cookies in [
        vec![other.flow.as_str()],
        vec![],
        vec!["rb_oauth=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
        vec!["rb_oauth=not-base64!"],
        vec!["rb_oauth="],
    ] {
        let res = back(&ctx, &q(s.state()), &cookies).await;
        assert_login_error(&res, "google_failed");
    }
    assert!(idp.token_requests().is_empty(), "Google was never asked");
    assert_eq!(count(&ctx, "user_identities").await, 0);

    // The right pair still works afterwards: nothing was spent.
    let ok = back(&ctx, &q(s.state()), &[&s.flow]).await;
    assert!(ok.cookie_named("rb_session").is_some(), "{:?}", ok.location);
}

#[tokio::test]
async fn a_sign_in_older_than_ten_minutes_is_refused() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    ctx.clock
        .advance(chrono::Duration::minutes(10) + chrono::Duration::seconds(1));
    let res = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&s.flow],
    )
    .await;
    assert_login_error(&res, "google_failed");
    assert!(idp.token_requests().is_empty());
}

#[tokio::test]
async fn an_id_token_with_anything_wrong_is_refused() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let good = |n: &str| Id::new("sub-sam", "sam@example.com", n);
    let sessions = count(&ctx, "sessions").await; // the admin's
    type Spoil = Box<dyn Fn(&str) -> String>;
    let cases: Vec<(&str, Spoil)> = vec![
        (
            "another audience",
            Box::new(move |n| {
                Id {
                    aud: "someone-else".into(),
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "another issuer",
            Box::new(move |n| {
                Id {
                    iss: "https://evil.example".into(),
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "another nonce",
            Box::new(move |n| Id::new("sub-sam", "sam@example.com", &format!("{n}x")).mint()),
        ),
        (
            "no nonce",
            Box::new(move |n| {
                Id {
                    nonce: None,
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "expired",
            Box::new(move |n| {
                Id {
                    expires_in: -3600,
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "email not verified",
            Box::new(move |n| {
                Id {
                    email_verified: json!(false),
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "email verified as text false",
            Box::new(move |n| {
                Id {
                    email_verified: json!("false"),
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "no email_verified",
            Box::new(move |n| {
                Id {
                    email_verified: Value::Null,
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "no email",
            Box::new(move |n| {
                Id {
                    email: None,
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "unknown key id",
            Box::new(move |n| {
                Id {
                    kid: "nobody".into(),
                    ..good(n)
                }
                .mint()
            }),
        ),
        (
            "payload changed after signing",
            Box::new(move |n| good(n).mint_tampered(&Id::new("sub-sam", "admin@example.com", n))),
        ),
        (
            "signed by another key under the right key id",
            Box::new(move |n| good(n).mint_with_other_key()),
        ),
        ("alg none", Box::new(move |n| good(n).mint_alg_none())),
        (
            "HS256 keyed with the public key",
            Box::new(move |n| good(n).mint_hs256()),
        ),
        ("not a token", Box::new(|_| "not.a.token".into())),
    ];
    for (what, make) in cases {
        let res = trip(&ctx, &idp, None, |n| make(n)).await;
        assert_login_error(&res, "google_failed");
        assert_eq!(
            count(&ctx, "user_identities").await,
            0,
            "{what}: nothing linked"
        );
        assert_eq!(
            count(&ctx, "sessions").await,
            sessions,
            "{what}: no session"
        );
    }
    // The checks above are not just a broken fake: the same trip with a good token works.
    let res = trip(&ctx, &idp, None, |n| good(n).mint()).await;
    assert!(res.cookie_named("rb_session").is_some());
    // The accepted spelling of the issuer without a scheme, and an email_verified written as text.
    let res = trip(&ctx, &idp, None, |n| {
        Id {
            iss: "accounts.google.com".into(),
            email_verified: json!("true"),
            ..good(n)
        }
        .mint()
    })
    .await;
    assert!(res.cookie_named("rb_session").is_some());
}

#[tokio::test]
async fn a_refusal_or_a_bad_code_ends_on_the_login_page() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let sessions = count(&ctx, "sessions").await; // the admin's
    let s = start(&ctx, "/api/auth/google/start", None).await;
    // Google says the person declined.
    let res = back(
        &ctx,
        &format!("error=access_denied&state={}", s.state()),
        &[&s.flow],
    )
    .await;
    assert_login_error(&res, "google_failed");
    // A code Google does not know.
    let res = back(
        &ctx,
        &format!("code=forged&state={}", s.state()),
        &[&s.flow],
    )
    .await;
    assert_login_error(&res, "google_failed");
    // A code won with another PKCE challenge than this sign-in sent.
    let code = idp.code_for(
        "another-challenge",
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    let res = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&s.flow],
    )
    .await;
    assert_login_error(&res, "google_failed");
    // No code at all.
    let res = back(&ctx, &format!("state={}", s.state()), &[&s.flow]).await;
    assert_login_error(&res, "google_failed");
    assert_eq!(count(&ctx, "sessions").await, sessions);
}

#[tokio::test]
async fn next_must_be_a_path_on_this_site() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    for (given, lands) in [
        ("https://evil.example", "/"),
        ("//evil.example", "/"),
        ("//evil.example/x", "/"),
        ("/\\evil.example", "/"),
        ("\\\\evil.example", "/"),
        ("javascript:alert(1)", "/"),
        ("evil.example", "/"),
        ("/ok/../fine?x=1#y", "/ok/../fine?x=1#y"),
        ("/settings", "/settings"),
    ] {
        let res = trip(&ctx, &idp, Some(given), |n| {
            Id::new("sub-sam", "sam@example.com", n).mint()
        })
        .await;
        assert_eq!(res.location.as_deref(), Some(lands), "{given}");
        assert!(res.cookie_named("rb_session").is_some(), "{given}");
    }
}

#[tokio::test]
async fn a_member_links_a_google_account_from_settings_without_a_matching_email() {
    let (ctx, idp) = app().await;
    let sam = member(&ctx, "sam", None).await;
    let session = ctx.login("sam", MEMBER_PASSWORD).await.session();

    let s = start(
        &ctx,
        "/api/auth/google/start?link=1&next=%2Fignored",
        Some(&session),
    )
    .await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@gmail.example", s.nonce()).mint(),
    );
    let res = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&session, &s.flow],
    )
    .await;
    assert_eq!(
        (res.status, res.location.as_deref()),
        (StatusCode::FOUND, Some("/settings?signin=linked"))
    );
    assert_flow_cleared(&res);
    assert!(
        res.cookie_named("rb_session").is_none(),
        "a link starts no session"
    );

    let list = ctx.get("/api/auth/identities", &session).await;
    assert_eq!(list.json.as_array().unwrap().len(), 1);
    assert_eq!(
        list.json[0]["email"],
        "gmail.example".replace("gmail.example", "sam@gmail.example")
    );
    // The account now signs sam in, and only sam.
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "whatever@elsewhere.example", n).mint()
    })
    .await;
    let pair = res
        .cookie_named("rb_session")
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string();
    assert_eq!(ctx.get("/api/auth/me", &pair).await.json["id"], sam["id"]);

    // Linking it again is fine and adds nothing.
    let s = start(&ctx, "/api/auth/google/start?link=1", Some(&session)).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@gmail.example", s.nonce()).mint(),
    );
    let res = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&session, &s.flow],
    )
    .await;
    assert_eq!(res.location.as_deref(), Some("/settings?signin=linked"));
    assert_eq!(count(&ctx, "user_identities").await, 1);
}

#[tokio::test]
async fn a_google_account_linked_to_another_member_is_taken() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    member(&ctx, "alex", None).await;
    trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;

    let alex = ctx.login("alex", MEMBER_PASSWORD).await.session();
    let s = start(&ctx, "/api/auth/google/start?link=1", Some(&alex)).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    let res = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&alex, &s.flow],
    )
    .await;
    assert_eq!(res.location.as_deref(), Some("/settings?signin=taken"));
    assert_flow_cleared(&res);
    assert_eq!(ctx.get("/api/auth/identities", &alex).await.json, json!([]));
}

#[tokio::test]
async fn a_link_needs_the_session_of_the_member_who_started_it() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", None).await;
    member(&ctx, "alex", None).await;
    let sam = ctx.login("sam", MEMBER_PASSWORD).await.session();
    let alex = ctx.login("alex", MEMBER_PASSWORD).await.session();

    // Without a session the start goes to the login page and sets no cookie.
    let res = ctx
        .call(Method::GET, "/api/auth/google/start?link=1", None, None)
        .await;
    assert_eq!(
        (res.status, res.location.as_deref()),
        (StatusCode::FOUND, Some("/login?next=/settings"))
    );
    assert!(res.cookies.is_empty());

    for finisher in [None, Some(alex.as_str())] {
        let s = start(&ctx, "/api/auth/google/start?link=1", Some(&sam)).await;
        let code = idp.code_for(
            s.challenge(),
            Id::new("sub-x", "x@gmail.example", s.nonce()).mint(),
        );
        let query = format!("code={code}&state={}", s.state());
        let cookies: Vec<&str> = finisher.into_iter().chain([s.flow.as_str()]).collect();
        let res = back(&ctx, &query, &cookies).await;
        assert_eq!(
            res.location.as_deref(),
            Some("/settings?signin=error"),
            "{finisher:?}"
        );
        assert_flow_cleared(&res);
    }
    assert_eq!(count(&ctx, "user_identities").await, 0);
    assert!(idp.token_requests().is_empty());

    // A failed link (the person said no) also ends in Settings.
    let s = start(&ctx, "/api/auth/google/start?link=1", Some(&sam)).await;
    let res = back(
        &ctx,
        &format!("error=access_denied&state={}", s.state()),
        &[&sam, &s.flow],
    )
    .await;
    assert_eq!(res.location.as_deref(), Some("/settings?signin=error"));
}

#[tokio::test]
async fn members_manage_only_their_own_linked_accounts() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    member(&ctx, "alex", Some("alex@example.com")).await;
    trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    trip(&ctx, &idp, None, |n| {
        Id::new("sub-alex", "alex@example.com", n).mint()
    })
    .await;
    let sam = ctx.login("sam", MEMBER_PASSWORD).await.session();
    let alex = ctx.login("alex", MEMBER_PASSWORD).await.session();
    let sams = ctx.get("/api/auth/identities", &sam).await.json[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let alexs = ctx.get("/api/auth/identities", &alex).await.json[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_ne!(sams, alexs);

    // Not someone else's, not a made-up one, not a malformed one.
    ctx.delete(&format!("/api/auth/identities/{alexs}"), &sam)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.delete(
        &format!("/api/auth/identities/{}", uuid::Uuid::new_v4()),
        &sam,
    )
    .await
    .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.delete("/api/auth/identities/not-an-id", &sam)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    assert_eq!(count(&ctx, "user_identities").await, 2);

    ctx.delete(&format!("/api/auth/identities/{sams}"), &sam)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(ctx.get("/api/auth/identities", &sam).await.json, json!([]));
    assert_eq!(
        ctx.get("/api/auth/identities", &alex)
            .await
            .json
            .as_array()
            .unwrap()
            .len(),
        1
    );
    ctx.delete(&format!("/api/auth/identities/{sams}"), &sam)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");

    // Unlinked: the address still matches, so the next Google sign-in links again. (The admin changing or clearing
    // the email ends that.)
    for (method, path) in [
        (Method::GET, "/api/auth/identities".to_string()),
        (Method::DELETE, format!("/api/auth/identities/{alexs}")),
    ] {
        let res = ctx.call(method, &path, None, None).await;
        res.assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
}

#[tokio::test]
async fn removing_a_member_removes_their_links() {
    let (ctx, idp) = app().await;
    let sam = member(&ctx, "sam", Some("sam@example.com")).await;
    trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    assert_eq!(count(&ctx, "user_identities").await, 1);
    ctx.delete(
        &format!("/api/users/{}", sam["id"].as_str().unwrap()),
        &ctx.cookie,
    )
    .await
    .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(count(&ctx, "user_identities").await, 0);
    // The Google account is a stranger again.
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    assert_login_error(&res, "google_not_member");
}

#[tokio::test]
async fn an_admin_sets_and_clears_a_members_email() {
    let (ctx, _) = app().await;
    let c = ctx.cookie.as_str();
    let admin = ctx.get("/api/auth/me", c).await;
    assert_eq!(admin.json["email"], Value::Null, "the key is there, null");

    // Create: normalised; blank means none; malformed and taken are refused.
    let sam = member(&ctx, "sam", Some("  Sam@Example.COM ")).await;
    assert_eq!(sam["email"], "sam@example.com");
    let blank = ctx
        .create_user(c, a_user().named("blank").email("   "))
        .await;
    assert_eq!(blank["email"], Value::Null);
    ctx.post(
        "/api/users",
        c,
        a_user().named("bad").email("not an email").json(),
    )
    .await
    .assert_error(StatusCode::BAD_REQUEST, "validation");
    ctx.post(
        "/api/users",
        c,
        a_user().named("dup").email("SAM@example.com").json(),
    )
    .await
    .assert_error(StatusCode::CONFLICT, "conflict");
    assert_eq!(
        count(&ctx, "users").await,
        3,
        "the refused ones were not created"
    );

    let listed = ctx.get("/api/users", c).await;
    let sam_row = listed
        .json
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["username"] == "sam")
        .unwrap();
    assert_eq!(sam_row["email"], "sam@example.com");

    // Update.
    let id = blank["id"].as_str().unwrap();
    let path = format!("/api/users/{id}");
    let patch = |body: Value| ctx.call(Method::PATCH, &path, Some(c), Some(body));
    let set = patch(json!({ "email": " Blank@Example.com" })).await;
    set.assert_status(StatusCode::OK);
    assert_eq!(
        (set.json["email"].as_str(), set.json["username"].as_str()),
        (Some("blank@example.com"), Some("blank"))
    );
    patch(json!({ "email": "sam@example.com" }))
        .await
        .assert_error(StatusCode::CONFLICT, "conflict");
    patch(json!({ "email": "nope" }))
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    patch(json!({}))
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    patch(json!({ "email": 5 }))
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    let cleared = patch(json!({ "email": null })).await;
    cleared.assert_status(StatusCode::OK);
    assert_eq!(cleared.json["email"], Value::Null);
    let blanked = patch(json!({ "email": "" })).await;
    assert_eq!(blanked.json["email"], Value::Null);
    ctx.call(
        Method::PATCH,
        &format!("/api/users/{}", uuid::Uuid::new_v4()),
        Some(c),
        Some(json!({ "email": null })),
    )
    .await
    .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.call(
        Method::PATCH,
        "/api/users/not-an-id",
        Some(c),
        Some(json!({ "email": null })),
    )
    .await
    .assert_error(StatusCode::BAD_REQUEST, "validation");

    // Only an admin, and only signed in.
    let member_session = ctx.login("sam", MEMBER_PASSWORD).await.session();
    ctx.call(
        Method::PATCH,
        &path,
        Some(&member_session),
        Some(json!({ "email": null })),
    )
    .await
    .assert_error(StatusCode::FORBIDDEN, "forbidden");
    ctx.call(Method::PATCH, &path, None, Some(json!({ "email": null })))
        .await
        .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
}

#[tokio::test]
async fn replaying_a_finished_callback_signs_nobody_in_again() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    let query = format!("code={code}&state={}", s.state());
    let first = back(&ctx, &query, &[&s.flow]).await;
    assert!(first.cookie_named("rb_session").is_some());
    let sessions = count(&ctx, "sessions").await;

    // The same cookie and the same code again: Google refuses a used code, and no second session starts.
    let replay = back(&ctx, &query, &[&s.flow]).await;
    assert_login_error(&replay, "google_failed");
    assert_eq!(
        idp.token_requests().len(),
        2,
        "Google was asked and said no"
    );
    assert_eq!(count(&ctx, "sessions").await, sessions);
    assert_eq!(count(&ctx, "user_identities").await, 1);
}

#[tokio::test]
async fn a_malformed_callback_query_still_clears_the_cookie_and_ends_on_the_login_page() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    for query in [
        format!("code=a&code={code}&state={}", s.state()),
        format!("code={code}&state={0}&state={0}", s.state()),
        format!("code={code}&error=a&error=b&state={}", s.state()),
    ] {
        let res = back(&ctx, &query, &[&s.flow]).await;
        assert_login_error(&res, "google_failed");
    }
    assert!(idp.token_requests().is_empty(), "Google was never asked");
    // Nothing was spent: the good query still works.
    let ok = back(
        &ctx,
        &format!("code={code}&state={}", s.state()),
        &[&s.flow],
    )
    .await;
    assert!(ok.cookie_named("rb_session").is_some());
}

#[tokio::test]
async fn an_address_that_keeps_failing_the_callback_is_sent_back_without_asking_google() {
    let (ctx, idp) = app().await;
    member(&ctx, "sam", Some("sam@example.com")).await;
    let s = start(&ctx, "/api/auth/google/start", None).await;
    let spammer = "203.0.113.9:4000";
    let state = s.state();

    // A script re-uses one valid flow with made-up codes: each one reaches Google and is refused.
    for i in 0..5 {
        let res = back_from(
            &ctx,
            spammer,
            &format!("code=forged{i}&state={state}"),
            &[&s.flow],
        )
        .await;
        assert_login_error(&res, "google_failed");
    }
    assert_eq!(idp.token_requests().len(), 5);

    // Locked: still a page redirect with the cookie cleared (no JSON 429), and Google is not asked, even
    // with a good code.
    let code = idp.code_for(
        s.challenge(),
        Id::new("sub-sam", "sam@example.com", s.nonce()).mint(),
    );
    let query = format!("code={code}&state={state}");
    let res = back_from(&ctx, spammer, &query, &[&s.flow]).await;
    assert_login_error(&res, "google_failed");
    assert_eq!(idp.token_requests().len(), 5, "Google was not asked");

    // Another address is not affected, and neither is the same one by a different port.
    let ok = back_from(&ctx, "203.0.113.10:4000", &query, &[&s.flow]).await;
    assert!(ok.cookie_named("rb_session").is_some(), "{:?}", ok.location);
    assert_eq!(idp.token_requests().len(), 6);
    // Sign-in by password is a different count.
    ctx.login_from(spammer, None, "sam", MEMBER_PASSWORD)
        .await
        .assert_status(StatusCode::OK);

    // Later the address may try again.
    ctx.clock.advance(chrono::Duration::seconds(31));
    let s2 = start(&ctx, "/api/auth/google/start", None).await;
    let code = idp.code_for(
        s2.challenge(),
        Id::new("sub-sam", "sam@example.com", s2.nonce()).mint(),
    );
    let res = back_from(
        &ctx,
        spammer,
        &format!("code={code}&state={}", s2.state()),
        &[&s2.flow],
    )
    .await;
    assert!(
        res.cookie_named("rb_session").is_some(),
        "{:?}",
        res.location
    );
}

#[tokio::test]
async fn changing_or_clearing_a_members_email_ends_their_google_links() {
    let (ctx, idp) = app().await;
    let c = ctx.cookie.as_str();
    // The admin mistypes a stranger's address; the stranger signs in as Sam and is linked.
    let sam = member(&ctx, "sam", Some("alicia@example.com")).await;
    let path = format!("/api/users/{}", sam["id"].as_str().unwrap());
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-stranger", "alicia@example.com", n).mint()
    })
    .await;
    assert!(res.cookie_named("rb_session").is_some());
    assert_eq!(count(&ctx, "user_identities").await, 1);

    // Setting the same address again changes nothing.
    ctx.call(
        Method::PATCH,
        &path,
        Some(c),
        Some(json!({ "email": "Alicia@example.com" })),
    )
    .await
    .assert_status(StatusCode::OK);
    assert_eq!(count(&ctx, "user_identities").await, 1);

    // The admin corrects it: the stranger's link goes with the old address and the stranger is out.
    ctx.call(
        Method::PATCH,
        &path,
        Some(c),
        Some(json!({ "email": "sam@example.com" })),
    )
    .await
    .assert_status(StatusCode::OK);
    assert_eq!(count(&ctx, "user_identities").await, 0);
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-stranger", "alicia@example.com", n).mint()
    })
    .await;
    assert_login_error(&res, "google_not_member");
    // Sam's own account matches the new address and links afresh.
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    assert!(res.cookie_named("rb_session").is_some());
    assert_eq!(count(&ctx, "user_identities").await, 1);

    // Clearing the address ends that link too, and the account cannot come back by email.
    ctx.call(
        Method::PATCH,
        &path,
        Some(c),
        Some(json!({ "email": null })),
    )
    .await
    .assert_status(StatusCode::OK);
    assert_eq!(count(&ctx, "user_identities").await, 0);
    let res = trip(&ctx, &idp, None, |n| {
        Id::new("sub-sam", "sam@example.com", n).mint()
    })
    .await;
    assert_login_error(&res, "google_not_member");
}
