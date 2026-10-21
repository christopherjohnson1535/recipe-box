//! `POST /api/import/url` through the router, against a local HTTP server on 127.0.0.1 (no real network).
//! Needs `TEST_DATABASE_URL`; without it the tests are skipped. The app under test only gets to reach the test
//! server because `FetchPolicy::allow_loopback_port_for_tests` opens that one port; everything else stays blocked.

use std::{io::Cursor, path::PathBuf, str::FromStr, sync::Arc};

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Method, Request, StatusCode, header},
    response::{Html, IntoResponse},
    routing::{MethodRouter, get},
};
use http_body_util::BodyExt;
use recipe_box_api::{config::Config, import::safe_fetch::FetchPolicy, state::AppState};
use serde_json::{Value, json};
use sqlx::{
    Executor, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use tower::ServiceExt;
use uuid::Uuid;

const RECIPE_HTML: &str = include_str!("fixtures/wprm-graph.html");
const NO_RECIPE_HTML: &str = include_str!("fixtures/no-recipe.html");

struct Ctx {
    app: Router,
    pool: PgPool,
    admin_pool: PgPool,
    schema: String,
    media_dir: PathBuf,
    cookie: String,
}

struct Res {
    cookie: Option<String>,
    status: StatusCode,
    bytes: Vec<u8>,
    content_type: Option<String>,
    json: Value,
}

impl Res {
    fn code(&self) -> &str {
        self.json["error"]["code"].as_str().unwrap_or("")
    }
}

/// `loopback_port`: the test server's port to allow, or `None` for the production policy.
async fn ctx(loopback_port: Option<u16>) -> Option<Ctx> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("note: TEST_DATABASE_URL not set, skipping integration test");
        return None;
    };
    let admin_pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
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
    let mut state = AppState::new(pool.clone(), config).unwrap();
    if let Some(port) = loopback_port {
        state.fetch_policy = FetchPolicy::allow_loopback_port_for_tests(port);
    }
    let mut ctx = Ctx {
        app: recipe_box_api::router(state),
        pool,
        admin_pool,
        schema,
        media_dir,
        cookie: String::new(),
    };
    let res = ctx
        .call(
            Method::POST,
            "/api/setup",
            Some(json!({ "username": "admin", "displayName": "Admin", "password": "correct horse battery" })),
            None,
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json);
    ctx.cookie = res.cookie.unwrap().split(';').next().unwrap().to_string();
    Some(ctx)
}

impl Ctx {
    async fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        cookie: Option<&str>,
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
        let res = self
            .app
            .clone()
            .oneshot(req.body(body).unwrap())
            .await
            .unwrap();
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
            bytes,
            content_type,
            json,
        }
    }

    /// Signed-in `POST /api/import/url`.
    async fn import(&self, url: &str) -> Res {
        self.call(
            Method::POST,
            "/api/import/url",
            Some(json!({ "url": url })),
            Some(&self.cookie),
        )
        .await
    }

    async fn recipe_count(&self) -> i64 {
        sqlx::query_scalar("select count(*) from recipes")
            .fetch_one(&self.pool)
            .await
            .unwrap()
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

fn png() -> Vec<u8> {
    let mut out = Vec::new();
    image::DynamicImage::new_rgb8(64, 48)
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

fn html_route(body: impl Into<String>) -> MethodRouter {
    let body = Arc::new(body.into());
    get(move || {
        let body = body.clone();
        async move { Html((*body).clone()) }
    })
}

/// A local site; returns its base URL (`http://127.0.0.1:PORT`) and port. The recipe page points its photo at the
/// same server, so the image download goes through the guard too.
async fn site() -> (String, u16) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base = format!("http://127.0.0.1:{port}");
    let with_photo = RECIPE_HTML.replace(
        "https://saltandthyme.example/wp-content",
        &format!("{base}/wp-content"),
    );
    let without_photo = RECIPE_HTML.replace(
        "https://saltandthyme.example/wp-content",
        &format!("{base}/missing"),
    );
    let redirect = |to: String| {
        get(move || {
            let to = to.clone();
            async move { (StatusCode::FOUND, [(header::LOCATION, to)]) }
        })
    };
    let app = Router::new()
        .route("/recipe", html_route(with_photo))
        .route("/recipe-no-photo", html_route(without_photo))
        .route("/none", html_route(NO_RECIPE_HTML))
        .route(
            "/wp-content/uploads/2024/03/brown-butter-pasta.jpg",
            get(|| async { ([(header::CONTENT_TYPE, "image/png")], png()) }),
        )
        .route("/forbidden", get(|| async { (StatusCode::FORBIDDEN, "no bots") }))
        .route(
            "/botcheck",
            html_route("<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>"),
        )
        .route("/boom", get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "oops") }))
        .route(
            "/huge",
            get(|| async { ([(header::CONTENT_TYPE, "text/html")], vec![b'a'; 6 * 1024 * 1024]) }),
        )
        .route("/to-recipe", redirect(format!("{base}/recipe")))
        .route("/to-loopback", redirect("http://127.0.0.1:1/secret".into()))
        .route("/to-metadata", redirect("http://169.254.169.254/latest/meta-data/".into()))
        .route("/to-ipv6-loopback", redirect("http://[::1]:80/".into()))
        .route("/loop", redirect(format!("{base}/loop")))
        .route("/headers", get(|h: HeaderMap| async move {
            let ua = h.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
            let accept = h.get(header::ACCEPT).and_then(|v| v.to_str().ok()).unwrap_or("");
            assert!(ua.starts_with("Mozilla/5.0") && accept.contains("text/html"), "{ua} / {accept}");
            Html("<p>no recipe here</p>").into_response()
        }));
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (base, port)
}

#[tokio::test]
async fn imports_a_draft_with_photo_and_saves_nothing() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    let res = ctx.import(&format!("{base}/recipe")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    let d = &res.json;
    assert_eq!(d["title"], "Brown Butter Pasta with Sage");
    assert_eq!(d["ingredients"].as_array().unwrap().len(), 5);
    assert_eq!(d["steps"].as_array().unwrap().len(), 3);
    assert_eq!(d["servings"], "4 servings");
    assert_eq!(d["totalMinutes"], 20);
    assert_eq!(d["sourceType"], "link");
    assert_eq!(d["sourceUrl"], format!("{base}/recipe"));
    assert_eq!(d["sourceName"], "Maria Okafor");
    assert!(d["duplicateOf"].is_null());
    assert_eq!(d["warnings"].as_array().unwrap().len(), 0);
    // The photo was downloaded, re-encoded and stored; imageUrl is ours, not the site's.
    assert!(d["imageId"].is_string(), "{d}");
    let image_url = d["imageUrl"].as_str().unwrap();
    assert!(image_url.starts_with("/media/"), "{image_url}");
    let media = ctx
        .call(Method::GET, image_url, None, Some(&ctx.cookie))
        .await;
    assert_eq!(
        (media.status, media.content_type.as_deref()),
        (StatusCode::OK, Some("image/jpeg"))
    );
    assert_eq!(&media.bytes[..2], &[0xFF, 0xD8]);
    assert_eq!(ctx.recipe_count().await, 0);
    ctx.cleanup().await;
}

#[tokio::test]
async fn photo_failure_is_a_warning_not_an_error() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    let res = ctx.import(&format!("{base}/recipe-no-photo")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    assert!(res.json["imageId"].is_null() && res.json["imageUrl"].is_null());
    assert_eq!(res.json["warnings"].as_array().unwrap().len(), 1);
    assert_eq!(res.json["title"], "Brown Butter Pasta with Sage");
    ctx.cleanup().await;
}

#[tokio::test]
async fn uses_the_final_url_after_redirects() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    let res = ctx.import(&format!("{base}/to-recipe")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    assert_eq!(res.json["sourceUrl"], format!("{base}/recipe"));
    ctx.cleanup().await;
}

#[tokio::test]
async fn page_without_recipe_is_no_recipe_found() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    for path in ["/none", "/headers"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found"),
            "{path}"
        );
    }
    ctx.cleanup().await;
}

#[tokio::test]
async fn blocking_sites_are_site_blocked() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    for path in ["/forbidden", "/botcheck"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_GATEWAY, "site_blocked"),
            "{path}"
        );
    }
    ctx.cleanup().await;
}

#[tokio::test]
async fn other_failures_are_fetch_failed() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    for path in ["/boom", "/huge", "/loop", "/nothing-here"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_GATEWAY, "fetch_failed"),
            "{path}: {}",
            res.json
        );
    }
    ctx.cleanup().await;
}

#[tokio::test]
async fn redirects_into_internal_addresses_are_blocked() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    for path in ["/to-loopback", "/to-metadata", "/to-ipv6-loopback"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address"),
            "{path}"
        );
    }
    ctx.cleanup().await;
}

#[tokio::test]
async fn production_policy_refuses_internal_addresses() {
    let (base, _) = site().await; // a real listener on 127.0.0.1, still refused
    let Some(ctx) = ctx(None).await else { return };
    for url in [
        format!("{base}/recipe"),
        "http://127.0.0.1/".into(),
        "http://[::1]/".into(),
        "http://10.0.0.1/".into(),
        "http://169.254.169.254/latest/meta-data/".into(),
        "http://localhost/".into(),
    ] {
        let res = ctx.import(&url).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address"),
            "{url}"
        );
    }
    ctx.cleanup().await;
}

#[tokio::test]
async fn bad_input_and_no_session() {
    let Some(ctx) = ctx(None).await else { return };
    for bad in [
        "",
        "not a url",
        "ftp://example.com/x",
        "javascript:alert(1)",
    ] {
        let res = ctx.import(bad).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation"),
            "{bad}"
        );
    }
    let res = ctx
        .call(
            Method::POST,
            "/api/import/url",
            Some(json!({ "url": "https://example.com/" })),
            None,
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNAUTHORIZED, "unauthenticated")
    );
    ctx.cleanup().await;
}

#[tokio::test]
async fn already_saved_link_sets_duplicate_of() {
    let (base, port) = site().await;
    let Some(ctx) = ctx(Some(port)).await else {
        return;
    };
    let saved = ctx
        .call(
            Method::POST,
            "/api/recipes",
            Some(json!({ "title": "Saved pasta", "sourceUrl": format!("{base}/recipe/?utm_source=newsletter#top") })),
            Some(&ctx.cookie),
        )
        .await;
    assert_eq!(saved.status, StatusCode::CREATED, "{}", saved.json);
    let id = saved.json["id"].as_str().unwrap().to_string();

    let res = ctx.import(&format!("{base}/recipe")).await;
    assert_eq!(res.json["duplicateOf"], id.as_str());
    // Saved under the address that redirects here: the final URL matches too.
    let res = ctx.import(&format!("{base}/to-recipe")).await;
    assert_eq!(res.json["duplicateOf"], id.as_str());

    // A deleted recipe no longer counts.
    let del = ctx
        .call(
            Method::DELETE,
            &format!("/api/recipes/{id}"),
            None,
            Some(&ctx.cookie),
        )
        .await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    let res = ctx.import(&format!("{base}/recipe")).await;
    assert!(res.json["duplicateOf"].is_null());
    ctx.cleanup().await;
}
