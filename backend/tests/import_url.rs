//! `POST /api/import/url` through the router, against a local HTTP server on 127.0.0.1 (no real network).
//! Uses the shared harness in `common/`. The app under test only gets to reach the test
//! server because `FetchPolicy::allow_loopback_port_for_tests` opens that one port; everything else stays blocked.

mod common;

use std::{io::Cursor, sync::Arc};

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Method, Request, StatusCode, header},
    response::{Html, IntoResponse},
    routing::{MethodRouter, get},
};
use common::{Res, TestApp};
use futures_util::StreamExt;
use recipe_box_api::import::safe_fetch::FetchPolicy;
use serde_json::json;
use tower::ServiceExt;

const RECIPE_HTML: &str = include_str!("fixtures/wprm-graph.html");
const NO_RECIPE_HTML: &str = include_str!("fixtures/no-recipe.html");

/// `loopback_port`: the test server's port to allow, or `None` for the production policy.
async fn ctx(loopback_port: Option<u16>) -> TestApp {
    ctx_with(loopback_port.map(FetchPolicy::allow_loopback_port_for_tests)).await
}

/// `policy`: the fetch policy to test with, or `None` for the production default. Signed in as the admin.
async fn ctx_with(policy: Option<FetchPolicy>) -> TestApp {
    TestApp::spawn_as_admin_with(|state| {
        if let Some(policy) = policy {
            state.fetch_policy = policy;
        }
    })
    .await
}

trait ImportExt {
    async fn import(&self, url: &str) -> Res;
    async fn recipe_count(&self) -> i64;
}

impl ImportExt for TestApp {
    /// Signed-in `POST /api/import/url`.
    async fn import(&self, url: &str) -> Res {
        self.post("/api/import/url", &self.cookie, json!({ "url": url }))
            .await
    }

    async fn recipe_count(&self) -> i64 {
        sqlx::query_scalar("select count(*) from recipes")
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
}

fn png() -> Vec<u8> {
    let mut out = Vec::new();
    image::DynamicImage::new_rgb8(64, 48)
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

/// A PNG header (valid CRCs, no real pixels) claiming `w` x `h`.
fn png_claiming(w: u32, h: u32) -> Vec<u8> {
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        let mut body = kind.to_vec();
        body.extend(data);
        let mut crc = !0u32;
        for &b in &body {
            crc ^= u32::from(b);
            for _ in 0..8 {
                crc = if crc & 1 != 0 {
                    0xEDB8_8320 ^ (crc >> 1)
                } else {
                    crc >> 1
                };
            }
        }
        out.extend((data.len() as u32).to_be_bytes());
        out.extend(&body);
        out.extend((!crc).to_be_bytes());
    }
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = [w.to_be_bytes(), h.to_be_bytes()].concat();
    ihdr.extend([8, 2, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(
        &mut out,
        b"IDAT",
        &[0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01],
    );
    chunk(&mut out, b"IEND", &[]);
    out
}

const PHOTO_URL: &str =
    "https://saltandthyme.example/wp-content/uploads/2024/03/brown-butter-pasta.jpg";

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
        .route("/to-ftp", redirect(format!("ftp://127.0.0.1:{port}/recipe")))
        .route("/to-gopher", redirect(format!("gopher://127.0.0.1:{port}/recipe")))
        // 6 MB in 64 KB chunks with no Content-Length: only the streaming cap can stop it.
        .route(
            "/huge-chunked",
            get(|| async {
                let chunks = futures_util::stream::iter(
                    (0..96).map(|_| Ok::<_, std::io::Error>(vec![b'a'; 64 * 1024])),
                );
                ([(header::CONTENT_TYPE, "text/html")], Body::from_stream(chunks))
            }),
        )
        // One chunk, then silence forever.
        .route(
            "/drip",
            get(|| async {
                let chunks = futures_util::stream::once(async { Ok::<_, std::io::Error>(vec![b'<']) })
                    .chain(futures_util::stream::pending());
                ([(header::CONTENT_TYPE, "text/html")], Body::from_stream(chunks))
            }),
        )
        .route("/bomb.png", get(|| async { ([(header::CONTENT_TYPE, "image/png")], png_claiming(20_000, 20_000)) }))
        .route("/not-image.jpg", get(|| async { ([(header::CONTENT_TYPE, "image/jpeg")], "<html>nope</html>") }))
        .route("/img-js", html_route(RECIPE_HTML.replace(PHOTO_URL, "javascript:alert(1)")))
        .route("/img-data", html_route(RECIPE_HTML.replace(PHOTO_URL, "data:image/png;base64,AAAA")))
        .route("/img-internal", html_route(RECIPE_HTML.replace(PHOTO_URL, "http://10.0.0.1/x.jpg")))
        .route("/img-bomb", html_route(RECIPE_HTML.replace(PHOTO_URL, &format!("{base}/bomb.png"))))
        .route("/img-garbage", html_route(RECIPE_HTML.replace(PHOTO_URL, &format!("{base}/not-image.jpg"))))
        .route("/nested", html_route(format!("<html><body>{}</body></html>", "<div>".repeat(100_000))))
        .route(
            "/nested-with-ld",
            html_route(RECIPE_HTML.replace("</body>", &format!("{}</body>", "<div>".repeat(100_000)))),
        )
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
    let ctx = ctx(Some(port)).await;
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
    let media = ctx.get(image_url, &ctx.cookie).await;
    assert_eq!(
        (media.status, media.content_type.as_deref()),
        (StatusCode::OK, Some("image/jpeg"))
    );
    assert_eq!(&media.bytes[..2], &[0xFF, 0xD8]);
    assert_eq!(ctx.recipe_count().await, 0);
}

#[tokio::test]
async fn photo_failure_is_a_warning_not_an_error() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    let res = ctx.import(&format!("{base}/recipe-no-photo")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    assert!(res.json["imageId"].is_null() && res.json["imageUrl"].is_null());
    assert_eq!(res.json["warnings"].as_array().unwrap().len(), 1);
    assert_eq!(res.json["title"], "Brown Butter Pasta with Sage");
}

#[tokio::test]
async fn uses_the_final_url_after_redirects() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    let res = ctx.import(&format!("{base}/to-recipe")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    assert_eq!(res.json["sourceUrl"], format!("{base}/recipe"));
}

#[tokio::test]
async fn page_without_recipe_is_no_recipe_found() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    for path in ["/none", "/headers"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found"),
            "{path}"
        );
    }
}

#[tokio::test]
async fn blocking_sites_are_site_blocked() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    for path in ["/forbidden", "/botcheck"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_GATEWAY, "site_blocked"),
            "{path}"
        );
    }
}

#[tokio::test]
async fn other_failures_are_fetch_failed() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    for path in ["/boom", "/huge", "/loop", "/nothing-here"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_GATEWAY, "fetch_failed"),
            "{path}: {}",
            res.json
        );
    }
}

#[tokio::test]
async fn redirects_into_internal_addresses_are_blocked() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    for path in ["/to-loopback", "/to-metadata", "/to-ipv6-loopback"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address"),
            "{path}"
        );
    }
}

#[tokio::test]
async fn production_policy_refuses_internal_addresses() {
    let (base, _) = site().await; // a real listener on 127.0.0.1, still refused
    let ctx = ctx(None).await;
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
}

#[tokio::test]
async fn bad_input_and_no_session() {
    let ctx = ctx(None).await;
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
        // The UI maps "field: message" to a form field; this endpoint's field is `url`.
        let message = res.json["error"]["message"].as_str().unwrap_or("");
        assert!(message.starts_with("url: "), "{bad}: {message}");
    }
    let res = ctx
        .call(
            Method::POST,
            "/api/import/url",
            None,
            Some(json!({ "url": "https://example.com/" })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNAUTHORIZED, "unauthenticated")
    );
}

#[tokio::test]
async fn already_saved_link_sets_duplicate_of() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    let saved = ctx
        .post(
            "/api/recipes",
            &ctx.cookie,
            json!({ "title": "Saved pasta", "sourceUrl": format!("{base}/recipe/?utm_source=newsletter#top") }),
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
    let del = ctx.delete(&format!("/api/recipes/{id}"), &ctx.cookie).await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    let res = ctx.import(&format!("{base}/recipe")).await;
    assert!(res.json["duplicateOf"].is_null());
}

#[tokio::test]
async fn redirects_to_other_schemes_are_blocked() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    // Loopback is allowed on this port, so only the scheme check can refuse these.
    for path in ["/to-ftp", "/to-gopher"] {
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address"),
            "{path}"
        );
    }
}

#[tokio::test]
async fn loopback_allowance_is_one_port_only() {
    let (_, port) = site().await;
    let (other_base, _) = site().await;
    let ctx = ctx(Some(port)).await;
    let res = ctx.import(&format!("{other_base}/recipe")).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address")
    );
}

#[tokio::test]
async fn body_cap_applies_without_content_length() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    let res = ctx.import(&format!("{base}/huge-chunked")).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_GATEWAY, "fetch_failed")
    );
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .contains("too large"),
        "{}",
        res.json
    );
}

#[tokio::test]
async fn slow_sites_time_out() {
    let (base, port) = site().await;
    let policy = FetchPolicy::allow_loopback_port_for_tests(port)
        .with_timeout_for_tests(std::time::Duration::from_millis(700));
    let ctx = ctx_with(Some(policy)).await;
    let t = std::time::Instant::now();
    let res = ctx.import(&format!("{base}/drip")).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_GATEWAY, "fetch_failed")
    );
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .contains("too long"),
        "{}",
        res.json
    );
    assert!(t.elapsed().as_secs() < 5);
}

#[tokio::test]
async fn bad_photos_are_warnings_not_failures() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    for path in [
        "/img-js",
        "/img-data",
        "/img-internal",
        "/img-bomb",
        "/img-garbage",
    ] {
        let t = std::time::Instant::now();
        let res = ctx.import(&format!("{base}{path}")).await;
        assert_eq!(res.status, StatusCode::OK, "{path}: {}", res.json);
        assert_eq!(res.json["warnings"].as_array().unwrap().len(), 1, "{path}");
        assert!(
            res.json["imageId"].is_null() && res.json["imageUrl"].is_null(),
            "{path}"
        );
        assert_eq!(res.json["title"], "Brown Butter Pasta with Sage");
        assert!(t.elapsed().as_secs() < 5, "{path} took {:?}", t.elapsed());
    }
}

#[tokio::test]
async fn upload_of_a_huge_canvas_is_refused() {
    let ctx = ctx(None).await;
    let boundary = "XBOUNDARYX";
    let mut body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n"
    )
    .into_bytes();
    body.extend(png_claiming(20_000, 20_000));
    body.extend(format!("\r\n--{boundary}--\r\n").into_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/media")
        .header(header::COOKIE, &ctx.cookie)
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))
        .unwrap();
    let t = std::time::Instant::now();
    let res = ctx.router.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert!(t.elapsed().as_secs() < 5);
}

#[tokio::test]
async fn pathological_pages_return_promptly() {
    let (base, port) = site().await;
    let ctx = ctx(Some(port)).await;
    let t = std::time::Instant::now();
    let res = ctx.import(&format!("{base}/nested")).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found")
    );
    assert!(t.elapsed().as_secs() < 2, "took {:?}", t.elapsed());
    // JSON-LD pages never need the DOM, so a deep page with a recipe still imports.
    let t = std::time::Instant::now();
    let res = ctx.import(&format!("{base}/nested-with-ld")).await;
    assert_eq!(res.status, StatusCode::OK, "{}", res.json);
    assert!(t.elapsed().as_secs() < 2, "took {:?}", t.elapsed());
}
