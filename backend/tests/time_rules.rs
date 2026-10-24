//! Exact edges of every time rule, driven by the fixed clock (no row rewriting, no sleeping).
//!
//! Each window is open on its far edge: a recipe deleted at T can be restored while `now - T < 10 min`; a session
//! issued at T works while `now < T + SESSION_DAYS`; purge removes rows strictly older than its cutoff.

mod common;

use axum::http::StatusCode;
use chrono::Duration;
use common::{TestApp, a_recipe};

const RESTORE_WINDOW: Duration = Duration::minutes(10);
const SESSION_LIFETIME: Duration = Duration::days(30); // TestApp config: session_days = 30

fn ms(n: i64) -> Duration {
    Duration::milliseconds(n)
}

#[tokio::test]
async fn restore_window_edges() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    for (after, restorable) in [
        (RESTORE_WINDOW - ms(1), true),
        (RESTORE_WINDOW, false),
        (RESTORE_WINDOW + ms(1), false),
    ] {
        let id = ctx.create_recipe_id(c, a_recipe().titled("Edge")).await;
        ctx.delete(&format!("/api/recipes/{id}"), c)
            .await
            .assert_status(StatusCode::NO_CONTENT);
        ctx.clock.advance(after);
        let res = ctx
            .post(
                &format!("/api/recipes/{id}/restore"),
                c,
                serde_json::Value::Null,
            )
            .await;
        if restorable {
            res.assert_status(StatusCode::OK);
        } else {
            res.assert_error(StatusCode::CONFLICT, "conflict");
        }
    }
}

#[tokio::test]
async fn deleting_stamps_the_injected_clock() {
    let ctx = TestApp::spawn_as_admin().await;
    let id = ctx
        .create_recipe_id(&ctx.cookie, a_recipe().titled("Stamped"))
        .await;
    ctx.delete(&format!("/api/recipes/{id}"), &ctx.cookie)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    let stamped: chrono::DateTime<chrono::Utc> =
        sqlx::query_scalar("select deleted_at from recipes where id = $1::uuid")
            .bind(&id)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(stamped, common::epoch());
}

#[tokio::test]
async fn session_expiry_edges() {
    let ctx = TestApp::spawn_as_admin().await;
    ctx.create_user_for_login().await;
    for (after, valid) in [
        (SESSION_LIFETIME - ms(1), true),
        (SESSION_LIFETIME, false),
        (SESSION_LIFETIME + ms(1), false),
    ] {
        // A fresh session issued "now", then time moves.
        let cookie = common::session_pair(&ctx.login("member", common::MEMBER_PASSWORD).await);
        assert_eq!(ctx.me_status(&cookie).await, StatusCode::OK);
        ctx.clock.advance(after);
        let expected = if valid {
            StatusCode::OK
        } else {
            StatusCode::UNAUTHORIZED
        };
        assert_eq!(ctx.me_status(&cookie).await, expected, "after {after}");
    }
}

#[tokio::test]
async fn session_expiry_is_set_from_the_injected_clock() {
    let ctx = TestApp::spawn_as_admin().await;
    let expires: chrono::DateTime<chrono::Utc> =
        sqlx::query_scalar("select expires_at from sessions")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(expires, common::epoch() + SESSION_LIFETIME);
}

#[tokio::test]
async fn purge_recipe_edges() {
    // Purge removes recipes deleted strictly more than PURGE_AFTER ago.
    for (after, purged) in [
        (recipe_box_api::PURGE_AFTER - ms(1), false),
        (recipe_box_api::PURGE_AFTER, false),
        (recipe_box_api::PURGE_AFTER + ms(1), true),
    ] {
        let ctx = TestApp::spawn_as_admin().await;
        let id = ctx
            .create_recipe_id(&ctx.cookie, a_recipe().titled("Old"))
            .await;
        ctx.delete(&format!("/api/recipes/{id}"), &ctx.cookie).await;
        ctx.clock.advance(after);
        recipe_box_api::purge(&ctx.state).await.unwrap();
        let left: i64 = sqlx::query_scalar("select count(*) from recipes")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
        assert_eq!(left, if purged { 0 } else { 1 }, "after {after}");
    }
}

#[tokio::test]
async fn purge_session_edges() {
    // Purge removes sessions whose expiry is strictly in the past.
    for (after, purged) in [
        (SESSION_LIFETIME - ms(1), false),
        (SESSION_LIFETIME, false),
        (SESSION_LIFETIME + ms(1), true),
    ] {
        let ctx = TestApp::spawn_as_admin().await;
        ctx.clock.advance(after);
        recipe_box_api::purge(&ctx.state).await.unwrap();
        let left: i64 = sqlx::query_scalar("select count(*) from sessions")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
        assert_eq!(left, if purged { 0 } else { 1 }, "after {after}");
    }
}

trait LoginUser {
    async fn create_user_for_login(&self);
}

impl LoginUser for TestApp {
    async fn create_user_for_login(&self) {
        self.create_user(&self.cookie, common::a_user().named("member"))
            .await;
    }
}
