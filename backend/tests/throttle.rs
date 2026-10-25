//! Password-guessing throttle (issue #33) through the real router and Postgres. The clock is the harness's fixed
//! one: waiting is `ctx.clock.advance(..)`, never a sleep.

mod common;

use axum::http::{Method, StatusCode};
use chrono::Duration;
use common::{ADMIN_PASSWORD, MEMBER_PASSWORD, TestApp, a_user, session_pair};
use serde_json::{Value, json};

const WRONG: &str = "definitely not it";

/// What a client can see of a response: nothing more may differ between a real and an invented username.
fn seen(r: &common::Res) -> (StatusCode, String, String, Option<String>) {
    (
        r.status,
        r.code().to_string(),
        r.json["error"]["message"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        r.retry_after.clone(),
    )
}

#[tokio::test]
async fn the_sixth_wrong_password_is_refused_and_the_right_one_works_after_the_wait() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    for i in 1..=5 {
        let r = ctx.login("admin", WRONG).await;
        assert_eq!(
            (r.status, r.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated"),
            "attempt {i}"
        );
        assert!(r.retry_after.is_none());
    }
    let sixth = ctx.login("admin", WRONG).await;
    sixth.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert_eq!(sixth.retry_after.as_deref(), Some("30"));
    assert_eq!(
        sixth.json["error"]["message"],
        "Too many attempts. Try again in 30 seconds."
    );

    // The right password is refused too while locked, and no session is handed out.
    let early = ctx.login("admin", ADMIN_PASSWORD).await;
    early.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert!(early.cookie.is_none());

    // Refused attempts do not extend the lock: 29 s on, one second is left.
    ctx.clock.advance(Duration::seconds(29));
    let almost = ctx.login("admin", ADMIN_PASSWORD).await;
    almost.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert_eq!(almost.retry_after.as_deref(), Some("1"));

    ctx.clock.advance(Duration::seconds(1));
    ctx.login("admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn each_further_wrong_attempt_doubles_the_wait_up_to_fifteen_minutes() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    for _ in 0..5 {
        ctx.login("admin", WRONG).await;
    }
    let mut waits = vec![];
    for _ in 0..8 {
        let locked = ctx.login("admin", WRONG).await;
        let secs: i64 = locked.retry_after.as_deref().unwrap().parse().unwrap();
        waits.push(secs);
        ctx.clock.advance(Duration::seconds(secs));
        // One wrong attempt after the wait: allowed (401), and it locks for twice as long.
        ctx.login("admin", WRONG)
            .await
            .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
    assert_eq!(waits, [30, 60, 120, 240, 480, 900, 900, 900]);
}

#[tokio::test]
async fn success_starts_the_count_over() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    for _ in 0..4 {
        ctx.login("admin", WRONG).await;
    }
    ctx.login("admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
    for _ in 0..5 {
        ctx.login("admin", WRONG)
            .await
            .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
    ctx.login("admin", WRONG)
        .await
        .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
}

#[tokio::test]
async fn unknown_usernames_get_exactly_the_same_answers() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    // Same sequence for a real account and an invented one (and the real one in another spelling).
    let mut real = vec![];
    let mut fake = vec![];
    for _ in 0..8 {
        real.push(seen(&ctx.login("admin", WRONG).await));
        fake.push(seen(&ctx.login("nobody-by-that-name", WRONG).await));
        ctx.clock.advance(Duration::seconds(7));
    }
    assert_eq!(real, fake);
    assert!(real.iter().any(|r| r.1 == "rate_limited"));
    assert!(real.iter().any(|r| r.1 == "unauthenticated"));

    let upper = ctx.login("  ADMIN ", ADMIN_PASSWORD).await;
    let upper_fake = ctx.login("  NOBODY-BY-THAT-NAME ", ADMIN_PASSWORD).await;
    upper.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert_eq!(seen(&upper), seen(&upper_fake));
}

#[tokio::test]
async fn one_locked_name_does_not_lock_the_others() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    ctx.create_user(&admin, a_user().named("sam")).await;
    for _ in 0..6 {
        ctx.login("admin", WRONG).await;
    }
    ctx.login("sam", MEMBER_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
}

fn change(id: &str) -> String {
    format!("/api/users/{id}/password")
}

#[tokio::test]
async fn own_password_change_is_throttled_and_a_sign_in_lock_does_not_leak_into_it() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let sam = ctx.create_user(&admin, a_user().named("sam")).await;
    let id = sam["id"].as_str().unwrap().to_string();
    let cookie = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    let body = |current: &str| json!({ "password": "a brand new one", "currentPassword": current });

    for _ in 1..=5 {
        ctx.call(Method::PUT, &change(&id), Some(&cookie), Some(body(WRONG)))
            .await
            .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
    let sixth = ctx
        .call(Method::PUT, &change(&id), Some(&cookie), Some(body(WRONG)))
        .await;
    sixth.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert_eq!(sixth.retry_after.as_deref(), Some("30"));
    // Locked: the right current password is refused too, and nothing changed.
    ctx.call(
        Method::PUT,
        &change(&id),
        Some(&cookie),
        Some(body(MEMBER_PASSWORD)),
    )
    .await
    .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    // Signing in is a separate count.
    ctx.login("sam", MEMBER_PASSWORD)
        .await
        .assert_status(StatusCode::OK);

    ctx.clock.advance(Duration::seconds(30));
    ctx.call(
        Method::PUT,
        &change(&id),
        Some(&cookie),
        Some(body(MEMBER_PASSWORD)),
    )
    .await
    .assert_status(StatusCode::NO_CONTENT);
    ctx.login("sam", "a brand new one")
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn an_admin_reset_of_someone_elses_password_is_not_throttled() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let sam = ctx.create_user(&admin, a_user().named("sam")).await;
    let id = sam["id"].as_str().unwrap();
    for i in 0..10 {
        ctx.call(
            Method::PUT,
            &change(id),
            Some(&admin),
            Some(json!({ "password": format!("reset number {i} ok") })),
        )
        .await
        .assert_status(StatusCode::NO_CONTENT);
    }
}

#[tokio::test]
async fn a_short_new_password_is_still_a_400_while_locked() {
    // A too-short new password is rejected before the current one is looked at, so it is no guess: it neither
    // counts nor says anything about the current password.
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let sam = ctx.create_user(&admin, a_user().named("sam")).await;
    let id = sam["id"].as_str().unwrap().to_string();
    let cookie = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    for _ in 0..5 {
        ctx.call(
            Method::PUT,
            &change(&id),
            Some(&cookie),
            Some(json!({ "password": "a brand new one", "currentPassword": WRONG })),
        )
        .await;
    }
    let short = ctx
        .call(
            Method::PUT,
            &change(&id),
            Some(&cookie),
            Some(json!({ "password": "short", "currentPassword": WRONG })),
        )
        .await;
    short.assert_error(StatusCode::BAD_REQUEST, "validation");
}

// ---- client address ----------------------------------------------------------------------------------------

/// Twenty wrong guesses at twenty different usernames from one address.
async fn spray(ctx: &TestApp, peer: &str, xff: impl Fn(usize) -> Option<String>) {
    for i in 0..20 {
        let f = xff(i);
        ctx.login_from(peer, f.as_deref(), &format!("user{i}"), WRONG)
            .await
            .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
}

#[tokio::test]
async fn one_address_spraying_many_usernames_is_locked_out_and_a_spoofed_header_does_not_help() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    // No proxy is trusted by default: whatever X-Forwarded-For says, the peer is the client.
    spray(&ctx, "203.0.113.9:5000", |i| Some(format!("10.9.9.{i}"))).await;
    let blocked = ctx
        .login_from("203.0.113.9:5001", Some("10.1.1.1"), "another", WRONG)
        .await;
    blocked.assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    assert_eq!(blocked.retry_after.as_deref(), Some("30"));
    // Even the right password for a real account is refused from that address ...
    ctx.login_from("203.0.113.9:5002", None, "admin", ADMIN_PASSWORD)
        .await
        .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    // ... and works from another one.
    ctx.login_from("203.0.113.10:5000", None, "admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
    // Free again after the wait.
    ctx.clock.advance(Duration::seconds(30));
    ctx.login_from("203.0.113.9:5003", None, "admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn behind_a_trusted_proxy_that_does_not_say_who_the_client_is_nobody_locks_the_others_out() {
    // The compose default without TRUST_PROXY_HEADERS: every request comes from the web container (trusted) and
    // carries no client address. Twenty-five wrong guesses must not lock the shared proxy address.
    let ctx = TestApp::spawn_with(|s| {
        s.trusted_proxies = adapter_http::TrustedProxies::parse("10.0.0.0/8").unwrap();
    })
    .await;
    ctx.setup_admin().await;
    let proxy = "10.0.0.2:4444";
    for (i, xff) in [None, Some("unknown"), Some("10.0.0.9")]
        .into_iter()
        .cycle()
        .take(25)
        .enumerate()
    {
        ctx.login_from(proxy, xff, &format!("user{i}"), WRONG)
            .await
            .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    }
    // Somebody else on the LAN signs in fine, with no address to be blamed for the guesses ...
    ctx.login_from(proxy, None, "admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
    // ... while the username limit still protects each account.
    for _ in 0..5 {
        ctx.login_from(proxy, None, "sam", WRONG).await;
    }
    ctx.login_from(proxy, None, "sam", WRONG)
        .await
        .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
}

#[tokio::test]
async fn behind_a_trusted_proxy_each_forwarded_client_has_its_own_count() {
    let ctx = TestApp::spawn_with(|s| {
        s.trusted_proxies = adapter_http::TrustedProxies::parse("10.0.0.0/8").unwrap();
    })
    .await;
    ctx.setup_admin().await;
    let proxy = "10.0.0.2:4444";
    // The proxy appends the real client on the right; whatever the client put on the left is ignored.
    spray(&ctx, proxy, |i| Some(format!("6.6.6.{i}, 198.51.100.1"))).await;
    ctx.login_from(proxy, Some("198.51.100.1"), "admin", ADMIN_PASSWORD)
        .await
        .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    // A different client behind the same proxy is not affected.
    ctx.login_from(proxy, Some("198.51.100.2"), "admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
    // A direct caller cannot borrow that trust: from an untrusted peer the header means nothing.
    let direct = "203.0.113.50:1";
    spray(&ctx, direct, |_| Some("198.51.100.77".into())).await;
    ctx.login_from(proxy, Some("198.51.100.77"), "admin", ADMIN_PASSWORD)
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn parallel_wrong_guesses_are_counted_before_any_is_checked() {
    // Count-before-verify: with 40 guesses in flight at once, exactly 5 may reach the password check (401); the
    // other 35 are refused up front (429). No sleeps: the counting happens under one lock before any hashing.
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    let results = futures_util::future::join_all((0..40).map(|_| ctx.login("admin", WRONG))).await;
    let wrong = results
        .iter()
        .filter(|r| r.status == StatusCode::UNAUTHORIZED)
        .count();
    let limited = results
        .iter()
        .filter(|r| r.status == StatusCode::TOO_MANY_REQUESTS)
        .count();
    assert_eq!((wrong, limited), (5, 35));
    // Even the right password is refused now.
    ctx.login("admin", ADMIN_PASSWORD)
        .await
        .assert_error(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
}

#[tokio::test]
async fn the_error_body_has_the_documented_shape() {
    let ctx = TestApp::spawn().await;
    for _ in 0..6 {
        ctx.login("x", WRONG).await;
    }
    let r = ctx.login("x", WRONG).await;
    let Value::Object(error) = &r.json["error"] else {
        panic!("{}", r.json)
    };
    assert_eq!(error["code"], "rate_limited");
    assert!(
        error["message"]
            .as_str()
            .unwrap()
            .starts_with("Too many attempts.")
    );
    assert_eq!(error.len(), 2);
}
