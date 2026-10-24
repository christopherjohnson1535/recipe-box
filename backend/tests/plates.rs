//! Illustrated plates (#43): every stored photo gets a print-style rendition; the original stays untouched.

mod common;

use axum::http::StatusCode;
use common::{TestApp, a_recipe, a_user};
use recipe_box_api::{
    config::Config,
    routes::media::{backfill_displays, delete_images, reencode, render_display},
    state::AppState,
};
use serde_json::json;
use uuid::Uuid;

/// A PNG with some texture, 80x40 (2:1, so the plate is cropped to 4:3).
fn png() -> Vec<u8> {
    let img = image::RgbImage::from_fn(80, 40, |x, y| {
        image::Rgb([(x * 3) as u8, (y * 6) as u8, 120])
    });
    let mut out = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

async fn upload(app: &TestApp) -> serde_json::Value {
    let res = app.upload("/api/media", &app.cookie, "a.png", &png()).await;
    res.assert_status(StatusCode::CREATED);
    res.json
}

async fn recipe_with(app: &TestApp, image_id: &str) -> String {
    let mut body = a_recipe().json();
    body["imageId"] = json!(image_id);
    let res = app.post("/api/recipes", &app.cookie, body).await;
    res.assert_status(StatusCode::CREATED);
    res.json["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn upload_makes_a_rendition_and_keeps_the_original() {
    let app = TestApp::spawn_as_admin().await;
    let image = upload(&app).await;
    let (url, display) = (
        image["url"].as_str().unwrap(),
        image["displayUrl"].as_str().unwrap(),
    );
    assert_eq!(
        display,
        format!("/media/{}.display.jpg", image["id"].as_str().unwrap())
    );
    assert_eq!(std::fs::read_dir(&app.media_dir).unwrap().count(), 2);

    let plate = app.get(display, &app.cookie).await;
    plate.assert_status(StatusCode::OK);
    assert_eq!(plate.content_type.as_deref(), Some("image/jpeg"));
    let decoded = image::load_from_memory(&plate.bytes).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (53, 40));
    app.call(axum::http::Method::GET, display, None, None)
        .await
        .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");

    let original = app.get(url, &app.cookie).await;
    assert_eq!(original.bytes, reencode(&png()).unwrap().bytes);
    assert_ne!(original.bytes, plate.bytes);
}

#[tokio::test]
async fn recipes_carry_the_rendition_until_an_admin_turns_it_off() {
    let app = TestApp::spawn_as_admin().await;
    let image = upload(&app).await;
    let id = recipe_with(&app, image["id"].as_str().unwrap()).await;
    let (url, display) = (image["url"].clone(), image["displayUrl"].clone());

    let check = |detail: serde_json::Value, list: serde_json::Value, want: serde_json::Value| {
        assert_eq!(detail["imageUrl"], url);
        assert_eq!(list["items"][0]["imageUrl"], url);
        assert_eq!(detail["imageDisplayUrl"], want);
        assert_eq!(list["items"][0]["imageDisplayUrl"], want);
    };
    let fetch = || async {
        (
            app.get(&format!("/api/recipes/{id}"), &app.cookie)
                .await
                .json,
            app.get("/api/recipes", &app.cookie).await.json,
        )
    };
    let (detail, list) = fetch().await;
    check(detail, list, display);

    let settings = app.get("/api/settings", &app.cookie).await;
    assert_eq!(settings.json, json!({ "plateTreatment": true }));
    let off = app
        .put(
            "/api/settings",
            &app.cookie,
            json!({ "plateTreatment": false }),
        )
        .await;
    off.assert_status(StatusCode::OK);
    assert_eq!(off.json, json!({ "plateTreatment": false }));
    let (detail, list) = fetch().await;
    check(detail, list, json!(null));
    // The upload response still names the stored rendition.
    assert!(image["displayUrl"].is_string());
}

#[tokio::test]
async fn settings_rules() {
    let app = TestApp::spawn_as_admin().await;
    app.create_user(&app.cookie, a_user().named("sam")).await;
    let member = app.login("sam", common::MEMBER_PASSWORD).await.session();

    app.call(axum::http::Method::GET, "/api/settings", None, None)
        .await
        .assert_error(StatusCode::UNAUTHORIZED, "unauthenticated");
    app.get("/api/settings", &member)
        .await
        .assert_status(StatusCode::OK);
    app.put("/api/settings", &member, json!({ "plateTreatment": false }))
        .await
        .assert_error(StatusCode::FORBIDDEN, "forbidden");
    for bad in [
        json!({}),
        json!({ "plateTreatment": "yes" }),
        json!({ "plateTreatment": true, "x": 1 }),
    ] {
        app.put("/api/settings", &app.cookie, bad)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    assert_eq!(
        app.get("/api/settings", &app.cookie).await.json,
        json!({ "plateTreatment": true })
    );
}

#[tokio::test]
async fn backfill_renders_missing_plates_and_skips_unreadable_originals() {
    let app = TestApp::spawn_as_admin().await;
    let original = reencode(&png()).unwrap();
    let (good, missing) = (Uuid::new_v4(), Uuid::new_v4());
    for id in [good, missing] {
        sqlx::query(
            "insert into images (id, file_name, width, height, bytes) values ($1, $2, 80, 40, $3)",
        )
        .bind(id)
        .bind(format!("{id}.jpg"))
        .bind(original.bytes.len() as i32)
        .execute(&app.pool)
        .await
        .unwrap();
    }
    let path = app.media_dir.join(format!("{good}.jpg"));
    std::fs::write(&path, &original.bytes).unwrap();

    assert_eq!(
        backfill_displays(app.state.images.as_ref(), &app.media_dir).await,
        1
    );
    let name: Option<String> =
        sqlx::query_scalar("select display_file_name from images where id = $1")
            .bind(good)
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(name, Some(format!("{good}.display.jpg")));
    assert!(app.media_dir.join(format!("{good}.display.jpg")).exists());
    assert_eq!(std::fs::read(&path).unwrap(), original.bytes);
    let still_null: i64 =
        sqlx::query_scalar("select count(*) from images where display_file_name is null")
            .fetch_one(&app.pool)
            .await
            .unwrap();
    assert_eq!(still_null, 1);
    // Idempotent: nothing new to make, the unreadable one is skipped again.
    assert_eq!(
        backfill_displays(app.state.images.as_ref(), &app.media_dir).await,
        0
    );
}

#[tokio::test]
async fn a_rendition_of_a_deleted_image_is_not_left_behind() {
    let app = TestApp::spawn_as_admin().await;
    let id = Uuid::new_v4();
    // The original is on disk but its row is gone (deleted while the backfill was rendering).
    std::fs::write(
        app.media_dir.join(format!("{id}.jpg")),
        reencode(&png()).unwrap().bytes,
    )
    .unwrap();
    assert!(
        !render_display(app.state.images.as_ref(), &app.media_dir, id)
            .await
            .unwrap()
    );
    assert!(!app.media_dir.join(format!("{id}.display.jpg")).exists());
}

#[tokio::test]
async fn deleting_images_removes_the_original_and_the_rendition() {
    let app = TestApp::spawn_as_admin().await;
    let image = upload(&app).await;
    assert_eq!(std::fs::read_dir(&app.media_dir).unwrap().count(), 2);
    let config = Config {
        database_url: String::new(),
        media_dir: app.media_dir.clone(),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "none".into(),
        anthropic_api_key: None,
        ai_model: "test".into(),
        max_upload_mb: 2,
    };
    let state = AppState::new(app.pool.clone(), config).unwrap();
    let id: Uuid = image["id"].as_str().unwrap().parse().unwrap();
    delete_images(&state, &[id]).await;
    assert_eq!(std::fs::read_dir(&app.media_dir).unwrap().count(), 0);
    let rows: i64 = sqlx::query_scalar("select count(*) from images")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);
}

#[tokio::test]
async fn an_unknown_rendition_is_not_found() {
    let app = TestApp::spawn_as_admin().await;
    app.get(
        &format!("/media/{}.display.jpg", Uuid::new_v4()),
        &app.cookie,
    )
    .await
    .assert_error(StatusCode::NOT_FOUND, "not_found");
}
