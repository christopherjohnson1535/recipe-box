//! Household member routes against a real Postgres through the shared harness in `common/`.

mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use common::{MEMBER_PASSWORD, TestApp, a_user, session_pair};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

const PW: &str = MEMBER_PASSWORD;

/// `ctx.add(admin_cookie, username, role)`: a member made through the API.
trait AddUser {
    async fn add(&self, admin: &str, username: &str, role: &str) -> Value;
}

impl AddUser for TestApp {
    async fn add(&self, admin: &str, username: &str, role: &str) -> Value {
        let user = a_user().named(username);
        self.create_user(admin, if role == "admin" { user.admin() } else { user })
            .await
    }
}

fn id(u: &Value) -> String {
    u["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn members_are_refused_admin_routes() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let admin_id = id(&ctx
        .call(Method::GET, "/api/auth/me", Some(&admin), None)
        .await
        .json);
    let other = id(&ctx.add(&admin, "other", "member").await);
    ctx.add(&admin, "mem", "member").await;
    let mem = session_pair(&ctx.login("mem", PW).await);
    let m = Some(mem.as_str());

    let body = json!({ "username": "x1x", "displayName": "X", "password": PW, "role": "member" });
    for (method, path, b) in [
        (Method::GET, "/api/users".to_string(), None),
        (Method::POST, "/api/users".to_string(), Some(body)),
        (Method::DELETE, format!("/api/users/{other}"), None),
        (
            Method::PUT,
            format!("/api/users/{other}/password"),
            Some(json!({ "password": "another password" })),
        ),
        (
            Method::PUT,
            format!("/api/users/{admin_id}/password"),
            Some(json!({ "password": "another password" })),
        ),
    ] {
        let res = ctx.call(method.clone(), &path, m, b).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::FORBIDDEN, "forbidden"),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn admin_lists_creates_and_rejects_bad_input() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let a = Some(admin.as_str());
    let zed = ctx.add(&admin, "zed", "member").await;
    assert_eq!(zed["role"], "member");
    assert_eq!(zed["username"], "zed");
    assert!(zed.get("passwordHash").is_none() && zed.get("password_hash").is_none());
    ctx.add(&admin, "bob", "admin").await;

    let list = ctx.call(Method::GET, "/api/users", a, None).await;
    let names: Vec<&str> = list
        .json
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["displayName"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Admin", "BOB", "ZED"]);

    for (what, b) in [
        (
            "duplicate",
            json!({ "username": "zed", "displayName": "Z", "password": PW, "role": "member" }),
        ),
        (
            "duplicate other case",
            json!({ "username": "ZeD", "displayName": "Z", "password": PW, "role": "member" }),
        ),
    ] {
        let res = ctx.call(Method::POST, "/api/users", a, Some(b)).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::CONFLICT, "conflict"),
            "{what}"
        );
    }
    for b in [
        json!({ "username": "newbie", "displayName": "N", "password": "short", "role": "member" }),
        json!({ "username": "newbie", "displayName": "N", "password": PW, "role": "owner" }),
        json!({ "username": "n!", "displayName": "N", "password": PW, "role": "member" }),
        json!({ "username": "newbie", "displayName": " ", "password": PW, "role": "member" }),
    ] {
        let res = ctx.call(Method::POST, "/api/users", a, Some(b)).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation")
        );
    }
    // The new member can sign in.
    assert_eq!(ctx.login("zed", PW).await.status, StatusCode::OK);
}

#[tokio::test]
async fn delete_rules_and_effects() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let a = Some(admin.as_str());
    let admin_id = id(&ctx.call(Method::GET, "/api/auth/me", a, None).await.json);

    let own = ctx
        .call(Method::DELETE, &format!("/api/users/{admin_id}"), a, None)
        .await;
    assert_eq!(
        (own.status, own.code()),
        (StatusCode::FORBIDDEN, "forbidden")
    );
    // With another admin present only the self check can refuse this (last-admin can't mask it).
    let spare = id(&ctx.add(&admin, "spare", "admin").await);
    let own = ctx
        .call(Method::DELETE, &format!("/api/users/{admin_id}"), a, None)
        .await;
    assert_eq!(
        (own.status, own.code()),
        (StatusCode::FORBIDDEN, "forbidden")
    );
    assert_eq!(own.json["error"]["message"], "You can't remove yourself.");
    assert_eq!(ctx.me_status(&admin).await, StatusCode::OK);
    let del = ctx
        .call(Method::DELETE, &format!("/api/users/{spare}"), a, None)
        .await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    let gone = ctx
        .call(
            Method::DELETE,
            &format!("/api/users/{}", Uuid::new_v4()),
            a,
            None,
        )
        .await;
    assert_eq!(
        (gone.status, gone.code()),
        (StatusCode::NOT_FOUND, "not_found")
    );

    // A member's recipe survives their removal (created_by becomes null) and their session ends.
    let mem = id(&ctx.add(&admin, "mem", "member").await);
    let mem_cookie = session_pair(&ctx.login("mem", PW).await);
    let recipe = ctx
        .call(
            Method::POST,
            "/api/recipes",
            Some(&mem_cookie),
            Some(json!({ "title": "Mem soup" })),
        )
        .await;
    assert_eq!(recipe.status, StatusCode::CREATED, "{}", recipe.json);
    let recipe_id = recipe.json["id"].as_str().unwrap().to_string();
    let del = ctx
        .call(Method::DELETE, &format!("/api/users/{mem}"), a, None)
        .await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    assert_eq!(ctx.me_status(&mem_cookie).await, StatusCode::UNAUTHORIZED);
    assert_eq!(ctx.login("mem", PW).await.status, StatusCode::UNAUTHORIZED);
    let (n, by): (i64, i64) = sqlx::query_as(
        "select count(*), count(created_by) from recipes where id = $1::uuid and deleted_at is null",
    )
    .bind(&recipe_id)
    .fetch_one(&ctx.pool)
    .await
    .unwrap();
    assert_eq!((n, by), (1, 0));
    let (sessions,): (i64,) =
        sqlx::query_as("select count(*) from sessions where user_id = $1::uuid")
            .bind(&mem)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(sessions, 0);

    // With two admins, one can remove the other.
    let bob = id(&ctx.add(&admin, "bob", "admin").await);
    let bob_cookie = session_pair(&ctx.login("bob", PW).await);
    let del = ctx
        .call(Method::DELETE, &format!("/api/users/{bob}"), a, None)
        .await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    assert_eq!(ctx.me_status(&bob_cookie).await, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn two_admins_cannot_remove_each_other() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let admin_id = id(&ctx
        .call(Method::GET, "/api/auth/me", Some(&admin), None)
        .await
        .json);
    let bob = id(&ctx.add(&admin, "bob", "admin").await);
    let bob_cookie = session_pair(&ctx.login("bob", PW).await);

    // Simultaneous mutual deletes: exactly one wins, the loser is refused (last admin) or already signed out.
    let (p1, p2) = (
        format!("/api/users/{bob}"),
        format!("/api/users/{admin_id}"),
    );
    let (r1, r2) = tokio::join!(
        ctx.call(Method::DELETE, &p1, Some(&admin), None),
        ctx.call(Method::DELETE, &p2, Some(&bob_cookie), None),
    );
    let mut statuses = [r1.status, r2.status];
    statuses.sort();
    assert_eq!(statuses[0], StatusCode::NO_CONTENT, "{statuses:?}");
    assert!(
        matches!(
            statuses[1],
            StatusCode::FORBIDDEN | StatusCode::UNAUTHORIZED
        ),
        "{statuses:?}"
    );
    let (admins,): (i64,) = sqlx::query_as("select count(*) from users where role = 'admin'")
        .fetch_one(&ctx.pool)
        .await
        .unwrap();
    assert_eq!(admins, 1);
}

#[tokio::test]
async fn password_change_rules() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let a = Some(admin.as_str());
    let mem = id(&ctx.add(&admin, "mem", "member").await);
    let phone = session_pair(&ctx.login("mem", PW).await);
    let ipad = session_pair(&ctx.login("mem", PW).await);
    let path = format!("/api/users/{mem}/password");
    let new_pw = "brand new password";

    // Own password: current required and checked.
    for b in [
        json!({ "password": new_pw }),
        json!({ "password": new_pw, "currentPassword": "wrong wrong wrong" }),
    ] {
        let res = ctx.call(Method::PUT, &path, Some(&phone), Some(b)).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated")
        );
        assert_eq!(res.json["error"]["message"], "Wrong username or password.");
    }
    let short = ctx
        .call(
            Method::PUT,
            &path,
            Some(&phone),
            Some(json!({ "password": "short", "currentPassword": PW })),
        )
        .await;
    assert_eq!(
        (short.status, short.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );
    assert_eq!(ctx.me_status(&ipad).await, StatusCode::OK);

    let ok = ctx
        .call(
            Method::PUT,
            &path,
            Some(&phone),
            Some(json!({ "password": new_pw, "currentPassword": PW })),
        )
        .await;
    assert_eq!(ok.status, StatusCode::NO_CONTENT);
    assert_eq!(ctx.me_status(&phone).await, StatusCode::OK);
    assert_eq!(ctx.me_status(&ipad).await, StatusCode::UNAUTHORIZED);
    assert_eq!(ctx.login("mem", PW).await.status, StatusCode::UNAUTHORIZED);
    let again = ctx.login("mem", new_pw).await;
    assert_eq!(again.status, StatusCode::OK);
    let again = session_pair(&again);

    // Admin reset: no current password; all of that user's sessions end.
    let reset = ctx
        .call(
            Method::PUT,
            &path,
            a,
            Some(json!({ "password": "admin chosen pw" })),
        )
        .await;
    assert_eq!(reset.status, StatusCode::NO_CONTENT);
    for bad in ["short".to_string(), "x".repeat(1025)] {
        let res = ctx
            .call(Method::PUT, &path, a, Some(json!({ "password": bad })))
            .await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation")
        );
    }
    assert_eq!(ctx.me_status(&phone).await, StatusCode::UNAUTHORIZED);
    assert_eq!(ctx.me_status(&again).await, StatusCode::UNAUTHORIZED);
    assert_eq!(ctx.me_status(&admin).await, StatusCode::OK);
    assert_eq!(
        ctx.login("mem", "admin chosen pw").await.status,
        StatusCode::OK
    );

    let missing = ctx
        .call(
            Method::PUT,
            &format!("/api/users/{}/password", Uuid::new_v4()),
            a,
            Some(json!({ "password": new_pw })),
        )
        .await;
    assert_eq!(
        (missing.status, missing.code()),
        (StatusCode::NOT_FOUND, "not_found")
    );
}

#[tokio::test]
async fn id_edges_and_admin_own_password() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let a = Some(admin.as_str());
    ctx.add(&admin, "mem", "member").await;
    let mem = session_pair(&ctx.login("mem", PW).await);

    // A member gets 403 (never 404) for an id that doesn't exist: no existence oracle.
    let res = ctx
        .call(
            Method::PUT,
            &format!("/api/users/{}/password", Uuid::new_v4()),
            Some(&mem),
            Some(json!({ "password": "another password" })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::FORBIDDEN, "forbidden")
    );
    // Malformed ids are a 400.
    for (method, path) in [
        (Method::DELETE, "/api/users/abc"),
        (Method::PUT, "/api/users/abc/password"),
    ] {
        let res = ctx
            .call(
                method,
                path,
                a,
                Some(json!({ "password": "another password" })),
            )
            .await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation"),
            "{path}"
        );
    }

    // An admin changing their own password needs the current one, keeps this session, ends the others.
    let admin_id = id(&ctx.call(Method::GET, "/api/auth/me", a, None).await.json);
    let other = session_pair(&ctx.login("admin", "correct horse battery").await);
    let path = format!("/api/users/{admin_id}/password");
    let res = ctx
        .call(
            Method::PUT,
            &path,
            a,
            Some(json!({ "password": "a new admin password" })),
        )
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    let res = ctx
        .call(
            Method::PUT,
            &path,
            a,
            Some(json!({ "password": "a new admin password", "currentPassword": "correct horse battery" })),
        )
        .await;
    assert_eq!(res.status, StatusCode::NO_CONTENT);
    assert_eq!(ctx.me_status(&admin).await, StatusCode::OK);
    assert_eq!(ctx.me_status(&other).await, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn json_errors_do_not_echo_values() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let res = ctx
        .call(
            Method::POST,
            "/api/users",
            Some(&admin),
            Some(json!({ "username": "zed", "displayName": "Z", "password": 98765432101234_i64, "role": "member" })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );
    let msg = res.json["error"]["message"].as_str().unwrap();
    assert!(!msg.contains("98765432101234"), "{msg}");
    assert!(msg.ends_with("invalid JSON or wrong field type"), "{msg}");
}

/// The delete takes row locks on every admin before checking "last admin". Hold one admin row from the test:
/// the delete must wait for it. Without `for update` it would finish straight away.
#[tokio::test]
async fn remove_waits_for_the_admin_row_lock() {
    let ctx = TestApp::spawn().await;
    let admin = ctx.setup_admin().await;
    let bob = id(&ctx.add(&admin, "bob", "admin").await);

    let mut tx = ctx.pool.begin().await.unwrap();
    sqlx::query("select id from users where username = 'admin' for update")
        .fetch_one(&mut *tx)
        .await
        .unwrap();

    let app = ctx.router.clone();
    let req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/users/{bob}"))
        .header(header::COOKIE, &admin)
        .body(Body::empty())
        .unwrap();
    let task = tokio::spawn(async move { app.oneshot(req).await.unwrap().status() });

    // Each test's pool sets application_name to its schema, so only this test's blocked delete matches.
    let mut blocked = false;
    for _ in 0..500 {
        blocked = sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from pg_stat_activity where application_name = $1 and wait_event_type = 'Lock')",
        )
        .bind(ctx.schema())
        .fetch_one(&ctx.pool)
        .await
        .unwrap();
        if blocked {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert!(
        blocked,
        "delete never started waiting on the admin row lock"
    );
    assert!(
        !task.is_finished(),
        "delete finished while an admin row was locked"
    );
    tx.rollback().await.unwrap();
    assert_eq!(task.await.unwrap(), StatusCode::NO_CONTENT);
}
