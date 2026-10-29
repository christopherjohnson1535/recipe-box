//! The "made it" log routes (REC-6) against a real Postgres. The rules (future days, who may delete) are tested in
//! `crates/app/tests/services.rs` and storage in the contract suite; this file checks the HTTP shape and wiring.

mod common;

use axum::http::{Method, StatusCode};
use common::{MEMBER_PASSWORD, TestApp, a_recipe, a_user, session_pair};
use serde_json::json;
use uuid::Uuid;

fn log_path(recipe: &str) -> String {
    format!("/api/recipes/{recipe}/cook-log")
}

#[tokio::test]
async fn every_route_needs_a_session() {
    let ctx = TestApp::spawn_as_admin().await;
    let (r, e) = (Uuid::new_v4(), Uuid::new_v4());
    for (method, path, body) in [
        (Method::GET, format!("/api/recipes/{r}/cook-log"), None),
        (
            Method::POST,
            format!("/api/recipes/{r}/cook-log"),
            Some(json!({ "cookedOn": "2026-01-15" })),
        ),
        (
            Method::DELETE,
            format!("/api/recipes/{r}/cook-log/{e}"),
            None,
        ),
    ] {
        let res = ctx.call(method.clone(), &path, None, body).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated"),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn members_log_a_recipe_and_see_who_and_when() {
    let ctx = TestApp::spawn_as_admin().await;
    let admin = ctx.cookie.as_str();
    ctx.create_user(admin, a_user().named("sam")).await;
    let sam = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    let soup = ctx.create_recipe_id(admin, a_recipe().titled("Soup")).await;

    let empty = ctx.get(&log_path(&soup), &sam).await;
    empty.assert_status(StatusCode::OK);
    assert_eq!(empty.json, json!([]));

    let made = ctx
        .post(
            &log_path(&soup),
            &sam,
            json!({ "cookedOn": "2026-01-14", "note": "  more lemon " }),
        )
        .await;
    made.assert_status(StatusCode::CREATED);
    let id = made.json["id"].as_str().unwrap().to_string();
    assert_eq!(
        made.json,
        json!({
            "id": id, "recipeId": soup, "cookedOn": "2026-01-14", "note": "more lemon",
            "madeBy": { "id": made.json["madeBy"]["id"], "displayName": "SAM" },
            "createdAt": "2026-01-15T12:00:00Z",
        })
    );
    // No note is fine; the admin's entry for a later day comes first.
    ctx.post(&log_path(&soup), admin, json!({ "cookedOn": "2026-01-15" }))
        .await
        .assert_status(StatusCode::CREATED);
    let list = ctx.get(&log_path(&soup), &sam).await;
    let who: Vec<_> = list
        .json
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["madeBy"]["displayName"].clone())
        .collect();
    assert_eq!(who, [json!("Admin"), json!("SAM")]);
    assert_eq!(list.json[0]["note"], "");
}

#[tokio::test]
async fn bad_input_is_a_400() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let soup = ctx.create_recipe_id(c, a_recipe().titled("Soup")).await;
    for (body, starts) in [
        (json!({ "cookedOn": "2026-01-17" }), "cookedOn:"), // the clock reads 2026-01-15
        (json!({ "cookedOn": "yesterday" }), "cookedOn"),
        (json!({}), "body:"),
        (
            json!({ "cookedOn": "2026-01-15", "note": "x".repeat(2001) }),
            "note:",
        ),
        (json!({ "cookedOn": "2026-01-15", "rating": 5 }), "rating"),
    ] {
        let res = ctx.post(&log_path(&soup), c, body.clone()).await;
        res.assert_error(StatusCode::BAD_REQUEST, "validation");
        let msg = res.json["error"]["message"].as_str().unwrap();
        assert!(msg.contains(starts), "{body}: {msg}");
    }
    ctx.get("/api/recipes/not-an-id/cook-log", c)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    ctx.get(&log_path(&Uuid::new_v4().to_string()), c)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
}

#[tokio::test]
async fn a_log_hides_with_its_recipe_and_outlives_its_cook() {
    let ctx = TestApp::spawn_as_admin().await;
    let admin = ctx.cookie.as_str();
    let member = ctx.create_user(admin, a_user().named("sam")).await;
    let sam = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    let soup = ctx.create_recipe_id(admin, a_recipe().titled("Soup")).await;
    let entry = ctx
        .post(
            &log_path(&soup),
            &sam,
            json!({ "cookedOn": "2026-01-15", "note": "n" }),
        )
        .await;
    let entry_path = format!("{}/{}", log_path(&soup), entry.json["id"].as_str().unwrap());

    // Someone else's entry: a member may not delete it.
    ctx.create_user(admin, a_user().named("cyd")).await;
    let cy = session_pair(&ctx.login("cyd", MEMBER_PASSWORD).await);
    ctx.delete(&entry_path, &cy)
        .await
        .assert_error(StatusCode::FORBIDDEN, "forbidden");

    ctx.delete(&format!("/api/recipes/{soup}"), admin)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    ctx.get(&log_path(&soup), &sam)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.post(&log_path(&soup), &sam, json!({ "cookedOn": "2026-01-15" }))
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.call(
        Method::POST,
        &format!("/api/recipes/{soup}/restore"),
        Some(admin),
        None,
    )
    .await
    .assert_status(StatusCode::OK);
    assert_eq!(
        ctx.get(&log_path(&soup), &sam)
            .await
            .json
            .as_array()
            .unwrap()
            .len(),
        1
    );

    // Removing the member keeps the entry, unsigned.
    ctx.delete(
        &format!("/api/users/{}", member["id"].as_str().unwrap()),
        admin,
    )
    .await
    .assert_status(StatusCode::NO_CONTENT);
    let left = ctx.get(&log_path(&soup), admin).await;
    assert_eq!(left.json[0]["madeBy"], json!(null));
    assert_eq!(left.json[0]["note"], "n");
    ctx.delete(&entry_path, admin)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    ctx.delete(&entry_path, admin)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
}
