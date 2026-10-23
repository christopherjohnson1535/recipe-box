//! `POST /api/import/photo` and HEIC uploads. The AI provider is a local mock; HEIC goes through the real
//! `heif-convert` (libheif-examples must be installed, in CI too).

mod common;

use std::{sync::Arc, time::Duration};

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use common::{
    Res, TestApp, a_recipe,
    anthropic::{MockAnthropic, error_reply, pancakes, tool_reply},
};
use recipe_box_api::{
    config::Secret,
    import::ai::{Ai, AnthropicProvider},
};
use serde_json::json;

/// Generated (not a real camera file): a 320x240 PNG of shapes encoded with `heif-enc` into an iPhone-style HEIC.
const HEIC: &[u8] = include_bytes!("fixtures/iphone-sample.heic");

fn jpeg(w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::new();
    image::RgbImage::from_pixel(w, h, image::Rgb([200, 120, 40]))
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut out, 80,
        ))
        .unwrap();
    out
}

async fn with_mock(replies: Vec<common::anthropic::Canned>) -> (TestApp, MockAnthropic) {
    let mock = MockAnthropic::start(replies).await;
    let p = AnthropicProvider::with_base_url(Secret::new("k"), "m".into(), &mock.base_url)
        .unwrap()
        .with_retry_delay_cap(Duration::ZERO);
    let app = TestApp::spawn_as_admin_with(|s| s.ai = Arc::new(Ai::Anthropic(p))).await;
    (app, mock)
}

async fn import(app: &TestApp, cookie: &str, parts: &[(&str, &[u8])]) -> Res {
    let boundary = "XphotoboundaryX";
    let mut body = Vec::new();
    for (name, data) in parts {
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"x\"\r\n\r\n").bytes());
        body.extend(*data);
        body.extend(b"\r\n");
    }
    body.extend(format!("--{boundary}--\r\n").bytes());
    let mut req = Request::post("/api/import/photo").header(
        header::CONTENT_TYPE,
        format!("multipart/form-data; boundary={boundary}"),
    );
    if !cookie.is_empty() {
        req = req.header(header::COOKIE, cookie);
    }
    app.send(req.body(Body::from(body)).unwrap()).await
}

async fn image_rows(app: &TestApp) -> i64 {
    sqlx::query_scalar("select count(*) from images")
        .fetch_one(&app.pool)
        .await
        .unwrap()
}

fn ids(res: &Res, at: &[&str]) -> Vec<String> {
    let mut v = &res.json;
    for k in at {
        v = &v[*k];
    }
    v.as_array()
        .unwrap()
        .iter()
        .map(|i| i.as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn heic_is_decoded_by_media_upload() {
    let app = TestApp::spawn_as_admin().await;
    let res = app
        .upload("/api/media", &app.cookie, "IMG_0001.HEIC", HEIC)
        .await;
    res.assert_status(StatusCode::CREATED);
    assert_eq!(
        (res.json["width"].as_i64(), res.json["height"].as_i64()),
        (Some(320), Some(240))
    );
    let served = app
        .get(res.json["url"].as_str().unwrap(), &app.cookie)
        .await;
    assert_eq!(&served.bytes[..2], &[0xFF, 0xD8]);
}

#[tokio::test]
async fn broken_heic_is_unsupported_and_leaves_nothing() {
    let app = TestApp::spawn_as_admin().await;
    let mut broken = HEIC[..400].to_vec();
    broken.extend([0u8; 64]);
    let res = app
        .upload("/api/media", &app.cookie, "a.heic", &broken)
        .await;
    res.assert_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media");
    assert_eq!(
        res.json["error"]["message"],
        "That HEIC photo could not be read."
    );
    assert_eq!(image_rows(&app).await, 0);
}

#[tokio::test]
async fn two_pages_become_one_draft_in_upload_order() {
    let (app, mock) = with_mock(vec![tool_reply(pancakes())]).await;
    let (a, b) = (jpeg(100, 80), jpeg(60, 40));
    let res = import(
        &app,
        &app.cookie,
        &[("files", &a), ("files", HEIC), ("files", &b)],
    )
    .await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["title"], "Pancakes");
    assert_eq!(res.json["sourceType"], "photo");
    assert!(res.json["imageId"].is_null());
    let photo_ids = ids(&res, &["photoImageIds"]);
    assert_eq!(photo_ids.len(), 3);

    let reqs = mock.requests();
    assert_eq!(reqs.len(), 1);
    let content = reqs[0].body["messages"][0]["content"].as_array().unwrap();
    let dims: Vec<_> = content[..3]
        .iter()
        .map(|c| {
            let bytes = STANDARD
                .decode(c["source"]["data"].as_str().unwrap())
                .unwrap();
            image::load_from_memory(&bytes)
                .unwrap()
                .into_rgb8()
                .dimensions()
        })
        .collect();
    assert_eq!(dims, [(100, 80), (320, 240), (60, 40)]);

    // PHO-7: saving the draft keeps the originals, in order.
    let mut recipe = a_recipe().json();
    recipe["photoImageIds"] = json!(photo_ids);
    let saved = app.post("/api/recipes", &app.cookie, recipe).await;
    saved.assert_status(StatusCode::CREATED);
    let got = app
        .get(
            &format!("/api/recipes/{}", saved.json["id"].as_str().unwrap()),
            &app.cookie,
        )
        .await;
    assert_eq!(ids(&got, &["photoImageIds"]), photo_ids);
}

#[tokio::test]
async fn no_ai_keeps_the_photos_and_returns_their_ids() {
    let app = TestApp::spawn_as_admin().await;
    let (a, b) = (jpeg(100, 80), jpeg(60, 40));
    let res = import(&app, &app.cookie, &[("files", &a), ("files", &b)]).await;
    res.assert_error(StatusCode::UNPROCESSABLE_ENTITY, "ai_disabled");
    let photo_ids = ids(&res, &["error", "photoImageIds"]);
    assert_eq!(photo_ids.len(), 2);
    assert_eq!(image_rows(&app).await, 2);
    for id in photo_ids {
        let served = app.get(&format!("/media/{id}.jpg"), &app.cookie).await;
        served.assert_status(StatusCode::OK);
    }
}

#[tokio::test]
async fn dish_mode_warns_and_uses_the_first_photo_as_the_hero() {
    let (app, mock) = with_mock(vec![tool_reply(pancakes())]).await;
    let (a, b) = (jpeg(100, 80), jpeg(60, 40));
    let res = import(
        &app,
        &app.cookie,
        &[("mode", b"dish"), ("files", &a), ("files", &b)],
    )
    .await;
    res.assert_status(StatusCode::OK);
    let photo_ids = ids(&res, &["photoImageIds"]);
    assert_eq!(res.json["imageId"], photo_ids[0]);
    assert_eq!(res.json["imageUrl"], format!("/media/{}.jpg", photo_ids[0]));
    assert!(
        res.json["warnings"]
            .to_string()
            .contains("photo of the dish")
    );
    assert_eq!(mock.requests().len(), 1);
}

#[tokio::test]
async fn provider_failures_carry_the_photo_ids() {
    let not_found = tool_reply(json!({ "found": false }));
    let (app, _mock) = with_mock(vec![not_found, error_reply(500), error_reply(500)]).await;
    let a = jpeg(100, 80);
    let res = import(&app, &app.cookie, &[("files", &a)]).await;
    res.assert_error(StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found");
    assert_eq!(ids(&res, &["error", "photoImageIds"]).len(), 1);
    let res = import(&app, &app.cookie, &[("files", &a)]).await;
    res.assert_error(StatusCode::BAD_GATEWAY, "ai_error");
    assert_eq!(ids(&res, &["error", "photoImageIds"]).len(), 1);
    assert_eq!(image_rows(&app).await, 2);
}

#[tokio::test]
async fn other_errors_have_no_photo_ids_field() {
    let app = TestApp::spawn_as_admin().await;
    let res = app.get("/api/recipes/not-an-id", &app.cookie).await;
    assert!(res.json["error"].get("photoImageIds").is_none());
}

#[tokio::test]
async fn bad_requests_are_rejected() {
    let app = TestApp::spawn_as_admin().await;
    let a = jpeg(10, 10);
    let res = import(&app, &app.cookie, &[("mode", b"recipe")]).await;
    res.assert_error(StatusCode::BAD_REQUEST, "validation");
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .starts_with("files:")
    );
    let seven: Vec<(&str, &[u8])> = (0..7).map(|_| ("files", &a[..])).collect();
    let res = import(&app, &app.cookie, &seven).await;
    res.assert_error(StatusCode::BAD_REQUEST, "validation");
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .starts_with("files:")
    );
    let res = import(&app, &app.cookie, &[("files", &a), ("mode", b"both")]).await;
    res.assert_error(StatusCode::BAD_REQUEST, "validation");
    assert_eq!(res.json["error"]["message"], "mode: use recipe or dish.");
    assert_eq!(image_rows(&app).await, 0);
}

#[tokio::test]
async fn one_garbage_file_fails_the_request_and_leaves_nothing() {
    let app = TestApp::spawn_as_admin().await;
    let a = jpeg(100, 80);
    let res = import(
        &app,
        &app.cookie,
        &[("files", &a), ("files", b"not an image"), ("files", &a)],
    )
    .await;
    res.assert_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media");
    assert_eq!(image_rows(&app).await, 0);
    assert_eq!(std::fs::read_dir(&app.media_dir).unwrap().count(), 0);
}

#[tokio::test]
async fn auth_and_size_limits() {
    let app = TestApp::spawn_as_admin().await;
    let a = jpeg(10, 10);
    import(&app, "", &[("files", &a)])
        .await
        .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    // Test limit is 2 MB per file; three such files together are over 2 MB but each is checked on its own.
    let big = vec![0u8; 2 * 1024 * 1024 + 1];
    import(&app, &app.cookie, &[("files", &a), ("files", &big)])
        .await
        .assert_error(StatusCode::PAYLOAD_TOO_LARGE, "too_large");
    assert_eq!(image_rows(&app).await, 0);
}

#[tokio::test]
async fn the_route_limit_is_per_file_not_per_request() {
    let app = TestApp::spawn_as_admin().await;
    // Two files of 1.9 MB pass the body limit (415 = read, not 413) although together they exceed MAX_UPLOAD_MB.
    let junk = vec![7u8; 1900 * 1024];
    import(&app, &app.cookie, &[("files", &junk), ("files", &junk)])
        .await
        .assert_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media");
}

/// The fixture with every `ispe` (image spatial extent) box rewritten to claim `w`x`h`.
fn heic_claiming(w: u32, h: u32) -> Vec<u8> {
    let mut data = HEIC.to_vec();
    let mut at = 0;
    while let Some(i) = data[at..].windows(4).position(|x| x == b"ispe") {
        let p = at + i + 8; // type, version+flags, then width and height
        data[p..p + 4].copy_from_slice(&w.to_be_bytes());
        data[p + 4..p + 8].copy_from_slice(&h.to_be_bytes());
        at += i + 4;
    }
    data
}

#[tokio::test]
async fn heic_claiming_a_huge_canvas_is_refused_before_decoding() {
    let app = TestApp::spawn_as_admin().await;
    for (w, h) in [(30_000, 30_000), (10_001, 10), (9_000, 9_000)] {
        let res = app
            .upload("/api/media", &app.cookie, "a.heic", &heic_claiming(w, h))
            .await;
        res.assert_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media");
        // The bounds message, not "could not be read": the decoder never ran on it.
        assert!(
            res.json["error"]["message"]
                .as_str()
                .unwrap()
                .starts_with("That image is too large"),
            "{w}x{h}"
        );
    }
}

#[tokio::test]
async fn a_dropped_request_deletes_the_photos_it_stored() {
    use tower::ServiceExt as _;
    // A provider that accepts the connection and never answers keeps the handler waiting after the photos are stored.
    let silent = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", silent.local_addr().unwrap());
    let _hold = tokio::spawn(async move {
        let mut held = Vec::new();
        while let Ok(conn) = silent.accept().await {
            held.push(conn);
        }
    });
    let p = AnthropicProvider::with_base_url(Secret::new("k"), "m".into(), &base).unwrap();
    let app = TestApp::spawn_as_admin_with(|s| s.ai = Arc::new(Ai::Anthropic(p))).await;

    let a = jpeg(100, 80);
    let boundary = "XphotoboundaryX";
    let mut body = Vec::new();
    body.extend(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"x\"\r\n\r\n"
        )
        .bytes(),
    );
    body.extend(&a);
    body.extend(format!("\r\n--{boundary}--\r\n").bytes());
    let req = Request::post("/api/import/photo")
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header(header::COOKIE, &app.cookie)
        .body(Body::from(body))
        .unwrap();
    // The client gives up: the future is dropped while the photo is stored and the provider is pending.
    let gave_up =
        tokio::time::timeout(Duration::from_millis(1500), app.router.clone().oneshot(req)).await;
    assert!(gave_up.is_err(), "the provider should still be pending");
    // The guard's cleanup runs in a spawned task.
    for _ in 0..100 {
        if image_rows(&app).await == 0 && std::fs::read_dir(&app.media_dir).unwrap().count() == 0 {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the stored photo was not cleaned up");
}

#[tokio::test]
async fn an_oversized_mode_field_is_a_bad_request() {
    let app = TestApp::spawn_as_admin().await;
    let a = jpeg(10, 10);
    let long = vec![b'x'; 4096];
    let res = import(&app, &app.cookie, &[("files", &a), ("mode", &long)]).await;
    res.assert_error(StatusCode::BAD_REQUEST, "validation");
    assert_eq!(image_rows(&app).await, 0);
}
