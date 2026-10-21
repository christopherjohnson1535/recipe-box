//! Household member routes against a real Postgres (same harness as api.rs; skipped without `TEST_DATABASE_URL`).

use std::{path::PathBuf, str::FromStr};

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use recipe_box_api::{config::Config, state::AppState};
use serde_json::{Value, json};
use sqlx::{
    Executor, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use tower::ServiceExt;
use uuid::Uuid;

struct Ctx {
    app: Router,
    pool: PgPool,
    admin_pool: PgPool,
    schema: String,
    media_dir: PathBuf,
}

#[allow(dead_code)]
struct Res {
    status: StatusCode,
    cookie: Option<String>,
    content_type: Option<String>,
    bytes: Vec<u8>,
    json: Value,
}

impl Res {
    fn code(&self) -> &str {
        self.json["error"]["code"].as_str().unwrap_or("")
    }
}

async fn ctx() -> Option<Ctx> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("note: TEST_DATABASE_URL not set, skipping integration test");
        return None;
    };
    let admin_pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    // The extension is database-wide; create it once in `public` (serialised, tests run in parallel).
    let mut tx = admin_pool.begin().await.unwrap();
    tx.execute("select pg_advisory_xact_lock(727274)")
        .await
        .unwrap();
    tx.execute("create extension if not exists citext with schema public")
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let schema = format!("test_{}", Uuid::new_v4().simple());
    admin_pool
        .execute(sqlx::AssertSqlSafe(format!("create schema {schema}")))
        .await
        .unwrap();
    let opts = PgConnectOptions::from_str(&url)
        .unwrap()
        .options([("search_path", format!("{schema},public"))]);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .unwrap();
    recipe_box_api::migrate(&pool).await.unwrap();

    let media_dir = std::env::temp_dir().join(&schema);
    std::fs::create_dir_all(&media_dir).unwrap();
    let config = Config {
        database_url: url,
        media_dir: media_dir.clone(),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "none".into(),
        anthropic_api_key: None,
        ai_model: "test".into(),
        max_upload_mb: 2,
    };
    let app = recipe_box_api::router(AppState::new(pool.clone(), config).unwrap());
    Some(Ctx {
        app,
        pool,
        admin_pool,
        schema,
        media_dir,
    })
}

impl Ctx {
    async fn send(&self, req: Request<Body>) -> Res {
        let res = self.app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let cookie = res
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().to_string());
        let content_type = res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_string());
        let bytes = res.into_body().collect().await.unwrap().to_bytes().to_vec();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        Res {
            status,
            cookie,
            content_type,
            bytes,
            json,
        }
    }

    async fn call(
        &self,
        method: Method,
        path: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> Res {
        let mut req = Request::builder().method(method).uri(path);
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        let body = match body {
            Some(v) => {
                req = req.header(header::CONTENT_TYPE, "application/json");
                Body::from(v.to_string())
            }
            None => Body::empty(),
        };
        self.send(req.body(body).unwrap()).await
    }

    /// Runs setup and returns the admin's `rb_session=...` cookie pair.
    async fn setup_admin(&self) -> String {
        let res = self
            .call(
                Method::POST,
                "/api/setup",
                None,
                Some(json!({ "username": "admin", "displayName": "Admin", "password": "correct horse battery" })),
            )
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.json);
        session_pair(&res)
    }

    async fn cleanup(self) {
        self.pool.close().await;
        self.admin_pool
            .execute(sqlx::AssertSqlSafe(format!(
                "drop schema {} cascade",
                self.schema
            )))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&self.media_dir);
    }
}

fn session_pair(res: &Res) -> String {
    let c = res.cookie.as_deref().expect("set-cookie");
    assert!(
        c.contains("HttpOnly") && c.contains("SameSite=Lax") && c.contains("Max-Age=2592000"),
        "{c}"
    );
    c.split(';').next().unwrap().to_string()
}

const PW: &str = "member password 1";

impl Ctx {
    async fn login(&self, username: &str, password: &str) -> Res {
        self.call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": username, "password": password })),
        )
        .await
    }

    async fn add(&self, admin: &str, username: &str, role: &str) -> Value {
        let res = self
            .call(
                Method::POST,
                "/api/users",
                Some(admin),
                Some(json!({ "username": username, "displayName": username.to_uppercase(), "password": PW, "role": role })),
            )
            .await;
        assert_eq!(res.status, StatusCode::CREATED, "{}", res.json);
        res.json
    }

    async fn me_status(&self, cookie: &str) -> StatusCode {
        self.call(Method::GET, "/api/auth/me", Some(cookie), None)
            .await
            .status
    }
}

fn id(u: &Value) -> String {
    u["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn members_are_refused_admin_routes() {
    let Some(ctx) = ctx().await else { return };
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
    ctx.cleanup().await;
}

#[tokio::test]
async fn admin_lists_creates_and_rejects_bad_input() {
    let Some(ctx) = ctx().await else { return };
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
    ctx.cleanup().await;
}

#[tokio::test]
async fn delete_rules_and_effects() {
    let Some(ctx) = ctx().await else { return };
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
    ctx.cleanup().await;
}

#[tokio::test]
async fn two_admins_cannot_remove_each_other() {
    let Some(ctx) = ctx().await else { return };
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
    ctx.cleanup().await;
}

#[tokio::test]
async fn password_change_rules() {
    let Some(ctx) = ctx().await else { return };
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
    ctx.cleanup().await;
}
