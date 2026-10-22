//! Alone in its own test binary on purpose: it reads a process-wide counter of argon2 work, so no other test may
//! share the process.

mod common;

use axum::http::{Method, StatusCode};
use common::TestApp;
use serde_json::json;

#[tokio::test]
async fn huge_passwords_are_refused_before_hashing() {
    let ctx = TestApp::spawn().await;
    let cookie = ctx.setup_admin().await;
    let huge = "x".repeat(1024 * 1000);
    let before = recipe_box_api::auth::password::work_count();

    let login = ctx
        .call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": "admin", "password": huge })),
        )
        .await;
    assert_eq!(
        (login.status, login.code()),
        (StatusCode::UNAUTHORIZED, "unauthenticated")
    );
    assert_eq!(
        login.json["error"]["message"],
        "Wrong username or password."
    );
    let setup = ctx
        .call(
            Method::POST,
            "/api/setup",
            None,
            Some(json!({ "username": "a2", "displayName": "A", "password": huge })),
        )
        .await;
    assert_eq!(setup.status, StatusCode::BAD_REQUEST);
    let create = ctx
        .call(
            Method::POST,
            "/api/users",
            Some(&cookie),
            Some(json!({ "username": "kid", "displayName": "K", "password": huge, "role": "member" })),
        )
        .await;
    assert_eq!(
        (create.status, create.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );
    let me = ctx
        .call(Method::GET, "/api/auth/me", Some(&cookie), None)
        .await;
    let id = me.json["id"].as_str().unwrap().to_string();
    let change = ctx
        .call(
            Method::PUT,
            &format!("/api/users/{id}/password"),
            Some(&cookie),
            Some(json!({ "password": "a brand new password", "currentPassword": huge })),
        )
        .await;
    assert_eq!(change.status, StatusCode::UNAUTHORIZED);
    let change = ctx
        .call(
            Method::PUT,
            &format!("/api/users/{id}/password"),
            Some(&cookie),
            Some(json!({ "password": huge, "currentPassword": "correct horse battery" })),
        )
        .await;
    assert_eq!(change.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        recipe_box_api::auth::password::work_count(),
        before,
        "a huge password reached argon2"
    );
}
