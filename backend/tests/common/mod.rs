//! The shared integration-test harness. Every file in `tests/` starts with `mod common;`.
//!
//! * `TestApp::spawn()` gives each test its own Postgres schema (migrated), its own media dir and a fixed clock.
//! * The database comes from `TEST_DATABASE_URL`; without it a throwaway Postgres 16 is started with
//!   testcontainers. If neither works the test panics. Nothing is ever skipped.
//! * Dropping a `TestApp` removes the schema and media dir, even when the test panics.
//! * No real network: tests that need HTTP serve fixtures from a local listener.

#![allow(dead_code)]

pub mod anthropic;

use std::{
    path::PathBuf,
    str::FromStr,
    sync::{
        OnceLock,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
};

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use chrono::{DateTime, TimeZone, Utc};
use http_body_util::BodyExt;
use recipe_box_api::{clock::Clock, config::Config, state::AppState};
use serde_json::{Value, json};
use sqlx::{
    ConnectOptions, Connection, Executor, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use tower::ServiceExt;
use uuid::Uuid;

pub const ADMIN_PASSWORD: &str = "correct horse battery";
pub const MEMBER_PASSWORD: &str = "member password 1";

/// Where every `TestApp` clock starts: fixed, so no test depends on the wall clock.
pub fn epoch() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 1, 15, 12, 0, 0).unwrap()
}

// ---- database ----------------------------------------------------------------------------------------------

/// Base URL of the Postgres all tests of this process share (each test makes its own schema inside it).
fn database_url() -> &'static str {
    static URL: OnceLock<String> = OnceLock::new();
    URL.get_or_init(|| match std::env::var("TEST_DATABASE_URL") {
        Ok(url) if !url.trim().is_empty() => url,
        _ => start_postgres_container().unwrap_or_else(|why| {
            panic!(
                "no test database. TEST_DATABASE_URL is not set and a Postgres container could not be started \
                 ({why}).\n\
                 Fix: start Docker so the tests can launch Postgres 16 themselves, or point TEST_DATABASE_URL at \
                 a database your role may create schemas in, e.g.\n  \
                 TEST_DATABASE_URL=postgres://recipes:recipes@127.0.0.1:5432/recipes_test\n\
                 Integration tests are never skipped."
            )
        }),
    })
}

/// Starts Postgres 16 with testcontainers. The container and its runtime live on a parked thread for the rest of
/// the process (testcontainers' reaper removes the container when the process exits).
fn start_postgres_container() -> Result<String, String> {
    use testcontainers_modules::{
        postgres::Postgres,
        testcontainers::{ImageExt, runners::AsyncRunner},
    };
    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    std::thread::Builder::new()
        .name("test-postgres-container".into())
        .spawn(move || {
            let rt = match tokio::runtime::Runtime::new() {
                Ok(rt) => rt,
                Err(e) => return drop(tx.send(Err(e.to_string()))),
            };
            let started = rt.block_on(async {
                let node = Postgres::default()
                    .with_tag("16-alpine")
                    .start()
                    .await
                    .map_err(|e| e.to_string())?;
                let host = node.get_host().await.map_err(|e| e.to_string())?;
                let port = node
                    .get_host_port_ipv4(5432)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok::<_, String>((
                    node,
                    format!("postgres://postgres:postgres@{host}:{port}/postgres"),
                ))
            });
            match started {
                Ok((node, url)) => {
                    let _ = tx.send(Ok(url));
                    let _keep_alive = (rt, node);
                    loop {
                        std::thread::park();
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                }
            }
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

// ---- responses ---------------------------------------------------------------------------------------------

pub struct Res {
    pub status: StatusCode,
    /// The first `Set-Cookie` header, whole.
    pub cookie: Option<String>,
    pub content_type: Option<String>,
    /// The `Retry-After` header, whole.
    pub retry_after: Option<String>,
    pub bytes: Vec<u8>,
    /// The body as JSON, `Null` when it isn't.
    pub json: Value,
}

impl Res {
    /// The API error code (`{"error":{"code":..}}`), or "".
    pub fn code(&self) -> &str {
        self.json["error"]["code"].as_str().unwrap_or("")
    }

    /// The `rb_session=...` pair from a login/setup response; asserts the cookie flags.
    pub fn session(&self) -> String {
        let c = self.cookie.as_deref().expect("set-cookie");
        assert!(
            c.contains("HttpOnly") && c.contains("SameSite=Lax") && c.contains("Max-Age=2592000"),
            "{c}"
        );
        c.split(';').next().unwrap().to_string()
    }

    #[track_caller]
    pub fn assert_status(&self, status: StatusCode) -> &Self {
        assert_eq!(self.status, status, "{}", self.json);
        self
    }

    #[track_caller]
    pub fn assert_error(&self, status: StatusCode, code: &str) -> &Self {
        assert_eq!((self.status, self.code()), (status, code), "{}", self.json);
        self
    }
}

// ---- the app -----------------------------------------------------------------------------------------------

pub struct TestApp {
    pub router: Router,
    /// The state the router was built from (its repositories share the app's database and clock).
    pub state: AppState,
    pub pool: PgPool,
    /// Shared with the app: move time with `clock.advance(..)`.
    pub clock: Clock,
    pub media_dir: PathBuf,
    /// The admin's session cookie after `spawn_as_admin()`, otherwise empty.
    pub cookie: String,
    /// Whether a recipe was saved through `send` yet (see there).
    saved_recipe: AtomicBool,
    guard: Guard,
}

impl TestApp {
    pub async fn spawn() -> Self {
        Self::spawn_with(|_| {}).await
    }

    /// Spawns and runs first-time setup; `cookie` holds the admin session.
    pub async fn spawn_as_admin() -> Self {
        let mut app = Self::spawn().await;
        app.cookie = app.setup_admin().await;
        app
    }

    /// Like `spawn_as_admin` with a tweak of the app state first (e.g. a wider fetch policy).
    pub async fn spawn_as_admin_with(tweak: impl FnOnce(&mut AppState)) -> Self {
        let mut app = Self::spawn_with(tweak).await;
        app.cookie = app.setup_admin().await;
        app
    }

    pub async fn spawn_with(tweak: impl FnOnce(&mut AppState)) -> Self {
        let url = database_url().to_string();
        let admin_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap_or_else(|e| panic!("can't connect to the test database: {e}"));
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
        let media_dir = std::env::temp_dir().join(&schema);
        // From here on the guard owns cleanup, including when setup below panics.
        let guard = Guard {
            url: url.clone(),
            schema: schema.clone(),
            media_dir: media_dir.clone(),
        };
        admin_pool
            .execute(sqlx::AssertSqlSafe(format!("create schema {schema}")))
            .await
            .unwrap();
        admin_pool.close().await;
        let opts = PgConnectOptions::from_str(&url)
            .unwrap()
            .options([("search_path", format!("{schema},public"))])
            // Names this test's connections so cleanup can end them, whatever state they are in.
            .application_name(&schema);
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .unwrap();
        adapter_postgres::migrate(&pool).await.unwrap();
        std::fs::create_dir_all(&media_dir).unwrap();

        let config = Config {
            database_url: url.clone(),
            media_dir: media_dir.clone(),
            bind_addr: "127.0.0.1:0".into(),
            cookie_secure: false,
            session_days: 30,
            ai_provider: "none".into(),
            anthropic_api_key: None,
            ai_model: "test".into(),
            max_upload_mb: 2,
        };
        let clock = Clock::fixed(epoch());
        let mut state = AppState::with_clock(pool.clone(), config, clock.clone()).unwrap();
        tweak(&mut state);
        let router = recipe_box_api::router(state.clone());

        Self {
            router,
            state,
            pool,
            clock,
            media_dir,
            cookie: String::new(),
            saved_recipe: AtomicBool::new(false),
            guard,
        }
    }

    /// The schema this test owns (for the leak check).
    pub fn schema(&self) -> &str {
        &self.guard.schema
    }

    // ---- requests ------------------------------------------------------------------------------------------

    pub async fn send(&self, req: Request<Body>) -> Res {
        // Why the clock moves at all: the test clock is frozen and repositories stamp `created_at` from it, so
        // consecutive saves would share one timestamp and "newest first" would fall back to the random ids. (The
        // database's `now()` used to give each row its own stamp.) Production uses the system clock, where ties
        // are only possible within one microsecond and are broken by id as before.
        // The repositories stamp `created_at` from the fixed clock (the database's `now()` used to). Recipes saved
        // one after another would tie, and "newest first" would fall back to random ids; so the clock moves one
        // microsecond before every save after the first. A lone save still happens at exactly the clock's time, and
        // the time rules (which move the clock by exact amounts) only compare against stamps taken after this.
        if req.method() == Method::POST
            && req.uri().path() == "/api/recipes"
            && self.saved_recipe.swap(true, Ordering::SeqCst)
        {
            self.clock.advance(chrono::Duration::microseconds(1));
        }
        let res = self.router.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let header_of = |name| {
            res.headers()
                .get(name)
                .map(|v| v.to_str().unwrap().to_string())
        };
        let cookie = header_of(header::SET_COOKIE);
        let content_type = header_of(header::CONTENT_TYPE);
        let retry_after = header_of(header::RETRY_AFTER);
        let bytes = res.into_body().collect().await.unwrap().to_bytes().to_vec();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        Res {
            status,
            cookie,
            content_type,
            retry_after,
            bytes,
            json,
        }
    }

    pub async fn call(
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

    pub async fn get(&self, path: &str, cookie: &str) -> Res {
        self.call(Method::GET, path, Some(cookie), None).await
    }

    pub async fn post(&self, path: &str, cookie: &str, body: Value) -> Res {
        self.call(Method::POST, path, Some(cookie), Some(body))
            .await
    }

    pub async fn put(&self, path: &str, cookie: &str, body: Value) -> Res {
        self.call(Method::PUT, path, Some(cookie), Some(body)).await
    }

    pub async fn delete(&self, path: &str, cookie: &str) -> Res {
        self.call(Method::DELETE, path, Some(cookie), None).await
    }

    pub async fn upload(&self, path: &str, cookie: &str, file_name: &str, data: &[u8]) -> Res {
        let boundary = "XtestboundaryX";
        let mut body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n\
             Content-Type: application/octet-stream\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(data);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let req = Request::post(path)
            .header(header::COOKIE, cookie)
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body))
            .unwrap();
        self.send(req).await
    }

    // ---- people --------------------------------------------------------------------------------------------

    /// Runs first-time setup and returns the admin's `rb_session=...` cookie pair.
    pub async fn setup_admin(&self) -> String {
        let res = self
            .call(
                Method::POST,
                "/api/setup",
                None,
                Some(json!({ "username": "admin", "displayName": "Admin", "password": ADMIN_PASSWORD })),
            )
            .await;
        res.assert_status(StatusCode::CREATED);
        res.session()
    }

    pub async fn login(&self, username: &str, password: &str) -> Res {
        self.call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": username, "password": password })),
        )
        .await
    }

    /// A request as if it came over TCP from `peer` (`"203.0.113.9:4000"`), optionally with `X-Forwarded-For`.
    pub async fn call_from(
        &self,
        peer: &str,
        forwarded_for: Option<&str>,
        method: Method,
        path: &str,
        cookie: Option<&str>,
        body: Value,
    ) -> Res {
        let mut req = Request::builder()
            .method(method)
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        if let Some(f) = forwarded_for {
            req = req.header("x-forwarded-for", f);
        }
        let mut req = req.body(Body::from(body.to_string())).unwrap();
        let peer: std::net::SocketAddr = peer.parse().unwrap();
        req.extensions_mut()
            .insert(axum::extract::ConnectInfo(peer));
        self.send(req).await
    }

    /// `login` from a given peer address and `X-Forwarded-For`.
    pub async fn login_from(
        &self,
        peer: &str,
        forwarded_for: Option<&str>,
        username: &str,
        password: &str,
    ) -> Res {
        self.call_from(
            peer,
            forwarded_for,
            Method::POST,
            "/api/auth/login",
            None,
            json!({ "username": username, "password": password }),
        )
        .await
    }

    pub async fn me_status(&self, cookie: &str) -> StatusCode {
        self.get("/api/auth/me", cookie).await.status
    }

    /// Creates a household member through the API (as the admin holding `admin_cookie`); returns the user JSON.
    pub async fn create_user(&self, admin_cookie: &str, user: UserBuilder) -> Value {
        let res = self.post("/api/users", admin_cookie, user.json()).await;
        res.assert_status(StatusCode::CREATED);
        res.json
    }

    // ---- recipes -------------------------------------------------------------------------------------------

    /// Creates a recipe through the API; returns the response.
    pub async fn create_recipe(&self, cookie: &str, recipe: RecipeBuilder) -> Res {
        self.post("/api/recipes", cookie, recipe.json()).await
    }

    /// Creates a recipe and returns its id (asserts 201).
    pub async fn create_recipe_id(&self, cookie: &str, recipe: RecipeBuilder) -> String {
        let res = self.create_recipe(cookie, recipe).await;
        res.assert_status(StatusCode::CREATED);
        res.json["id"].as_str().unwrap().to_string()
    }

    /// Inserts a recipe straight into the database (fast seeding for search tests).
    pub async fn insert_recipe(&self, recipe: RecipeBuilder) -> Uuid {
        let ings: Vec<Value> = recipe
            .ingredients
            .iter()
            .map(|t| json!({ "text": t }))
            .collect();
        let id: Uuid = sqlx::query_scalar(
            "insert into recipes (title, ingredients, total_minutes) values ($1, $2, $3) returning id",
        )
        .bind(&recipe.title)
        .bind(Value::Array(ings))
        .bind(recipe.minutes)
        .fetch_one(&self.pool)
        .await
        .unwrap();
        for tag in &recipe.tags {
            sqlx::query("insert into tags (name) values ($1) on conflict do nothing")
                .bind(tag)
                .execute(&self.pool)
                .await
                .unwrap();
            sqlx::query("insert into recipe_tags select $1, id from tags where name = $2")
                .bind(id)
                .bind(tag)
                .execute(&self.pool)
                .await
                .unwrap();
        }
        id
    }
}

// ---- builders ----------------------------------------------------------------------------------------------

pub struct UserBuilder {
    username: String,
    display_name: String,
    password: String,
    role: &'static str,
}

/// A member named `member` with `MEMBER_PASSWORD`; chain `.named("x")`, `.admin()`, `.password("..")`.
pub fn a_user() -> UserBuilder {
    UserBuilder {
        username: "member".into(),
        display_name: "MEMBER".into(),
        password: MEMBER_PASSWORD.into(),
        role: "member",
    }
}

impl UserBuilder {
    pub fn named(mut self, username: &str) -> Self {
        self.username = username.into();
        self.display_name = username.to_uppercase();
        self
    }

    pub fn admin(mut self) -> Self {
        self.role = "admin";
        self
    }

    pub fn password(mut self, password: &str) -> Self {
        self.password = password.into();
        self
    }

    pub fn json(&self) -> Value {
        json!({
            "username": self.username,
            "displayName": self.display_name,
            "password": self.password,
            "role": self.role,
        })
    }
}

pub struct RecipeBuilder {
    title: String,
    ingredients: Vec<String>,
    tags: Vec<String>,
    minutes: Option<i32>,
}

pub fn a_recipe() -> RecipeBuilder {
    RecipeBuilder {
        title: "A recipe".into(),
        ingredients: vec![],
        tags: vec![],
        minutes: None,
    }
}

impl RecipeBuilder {
    pub fn titled(mut self, title: &str) -> Self {
        self.title = title.into();
        self
    }

    pub fn with_ingredients(mut self, ingredients: &[&str]) -> Self {
        self.ingredients = ingredients.iter().map(|s| s.to_string()).collect();
        self
    }

    pub fn with_tags(mut self, tags: &[&str]) -> Self {
        self.tags = tags.iter().map(|s| s.to_string()).collect();
        self
    }

    pub fn minutes(mut self, minutes: i32) -> Self {
        self.minutes = Some(minutes);
        self
    }

    /// The request body for `POST /api/recipes`.
    pub fn json(&self) -> Value {
        let mut v = json!({
            "title": self.title,
            "ingredients": self.ingredients.iter().map(|t| json!({ "text": t })).collect::<Vec<_>>(),
            "tags": self.tags,
        });
        if let Some(m) = self.minutes {
            v["totalMinutes"] = json!(m);
        }
        v
    }
}

// ---- cleanup -----------------------------------------------------------------------------------------------

/// What gets removed when a test ends.
struct Guard {
    url: String,
    schema: String,
    media_dir: PathBuf,
}

impl Drop for Guard {
    fn drop(&mut self) {
        remove_schema_and_media(&self.url, &self.schema, &self.media_dir);
    }
}

/// Drop can't await, so the schema is dropped on a fresh thread with its own runtime and its own connection. That
/// works from a panicking test and from a runtime worker thread alike. A failure is printed, never swallowed.
fn remove_schema_and_media(url: &str, schema: &str, media_dir: &std::path::Path) {
    let _ = std::fs::remove_dir_all(media_dir);
    let (url, schema_name) = (url.to_string(), schema.to_string());
    let schema = schema_name.clone();
    let result = std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        rt.block_on(async {
            let mut conn = PgConnectOptions::from_str(&url)
                .map_err(|e| e.to_string())?
                .connect()
                .await
                .map_err(|e| e.to_string())?;
            // A connection left inside a transaction would block the drop, so end them all first.
            sqlx::query("select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1 and pid <> pg_backend_pid()")
                .bind(&schema)
                .execute(&mut conn)
                .await
                .map_err(|e| e.to_string())?;
            conn.execute(sqlx::AssertSqlSafe(format!(
                "drop schema if exists {schema} cascade"
            )))
            .await
            .map_err(|e| e.to_string())?;
            let _ = conn.close().await;
            Ok::<(), String>(())
        })
    })
    .join();
    match result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("test cleanup failed, schema {schema_name} may leak: {e}"),
        Err(_) => eprintln!("test cleanup thread panicked; a test schema may leak"),
    }
}

/// `res.session()` as a function, for call sites that read better that way.
pub fn session_pair(res: &Res) -> String {
    res.session()
}
