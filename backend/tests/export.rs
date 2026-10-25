//! `GET /api/export` and `POST /api/import/export` (ACC-5): the round trip, household scoping, and an import that
//! refuses malformed, hostile and invalid archives without keeping anything.

mod common;

use std::io::{Cursor, Write};

use axum::http::StatusCode;
use common::{Res, TestApp, a_recipe, a_user};
use serde_json::{Value, json};
use uuid::Uuid;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

fn jpeg(w: u32, h: u32, shade: u8) -> Vec<u8> {
    let mut out = Vec::new();
    let img = image::RgbImage::from_fn(w, h, |x, y| {
        image::Rgb([shade, (x * 255 / w) as u8, (y * 255 / h) as u8])
    });
    img.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
        &mut out, 90,
    ))
    .unwrap();
    out
}

async fn upload_photo(app: &TestApp, jpeg: &[u8]) -> String {
    let res = app.upload("/api/media", &app.cookie, "p.jpg", jpeg).await;
    res.assert_status(StatusCode::CREATED);
    res.json["id"].as_str().unwrap().to_string()
}

async fn export(app: &TestApp) -> Res {
    app.get("/api/export", &app.cookie).await
}

async fn import(app: &TestApp, zip: &[u8]) -> Res {
    app.upload("/api/import/export", &app.cookie, "backup.zip", zip)
        .await
}

fn zip_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut z = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, data) in entries {
        z.start_file(
            *name,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .unwrap();
        z.write_all(data).unwrap();
    }
    z.finish().unwrap().into_inner()
}

fn manifest(recipes: Value) -> Vec<u8> {
    json!({"format": "recipe-box-export", "version": 1, "recipes": recipes})
        .to_string()
        .into_bytes()
}

fn recipe_json(title: &str) -> Value {
    json!({"id": Uuid::new_v4(), "title": title, "ingredients": [{"text": "1 egg"}], "tags": ["x"]})
}

async fn recipe_count(app: &TestApp) -> i64 {
    app.get("/api/recipes?limit=200", &app.cookie).await.json["total"]
        .as_i64()
        .unwrap()
}

fn media_files(app: &TestApp) -> usize {
    std::fs::read_dir(&app.media_dir).unwrap().count()
}

/// Everything about a recipe that an export must carry, with ids and addresses left out.
fn essence(r: &Value) -> Value {
    let mut r = r.clone();
    let o = r.as_object_mut().unwrap();
    for k in [
        "id",
        "imageId",
        "photoImageIds",
        "imageUrl",
        "imageDisplayUrl",
        "photoUrls",
        "createdBy",
        "updatedBy",
        "createdAt",
        "updatedAt",
    ] {
        o.remove(k);
    }
    r
}

fn pixels(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let img = image::load_from_memory(bytes).unwrap().to_rgb8();
    (img.width(), img.height(), img.into_raw())
}

#[tokio::test]
async fn export_then_import_into_a_fresh_household_reproduces_recipes_and_photos() {
    let a = TestApp::spawn_as_admin().await;
    let (j1, j2) = (jpeg(64, 48, 40), jpeg(32, 80, 200));
    let (p1, p2) = (upload_photo(&a, &j1).await, upload_photo(&a, &j2).await);
    let soup = a
        .post(
            "/api/recipes",
            &a.cookie,
            json!({
                "title": "Soup", "description": "Warm.", "servings": "4", "prepMinutes": 5, "cookMinutes": 20,
                "totalMinutes": 25, "notes": "Better next day", "sourceUrl": "https://example.com/soup",
                "sourceName": "Example", "sourceType": "link",
                "ingredients": [{"text": "2 onions", "section": "Base"}, {"text": "salt"}],
                "steps": [{"text": "Chop."}, {"text": "Simmer.", "section": "Cook"}],
                "imageId": p2, "photoImageIds": [p2, p1], "tags": ["dinner", "soup"]
            }),
        )
        .await;
    soup.assert_status(StatusCode::CREATED);
    a.create_recipe_id(&a.cookie, a_recipe().titled("Plain toast"))
        .await;
    let gone = a
        .create_recipe_id(&a.cookie, a_recipe().titled("Deleted one"))
        .await;
    a.delete(&format!("/api/recipes/{gone}"), &a.cookie)
        .await
        .assert_status(StatusCode::NO_CONTENT);

    let res = export(&a).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.content_type.as_deref(), Some("application/zip"));
    let zip = res.bytes;

    // The archive: the manifest and exactly the two photos, none of the deleted recipe.
    let mut archive = ZipArchive::new(Cursor::new(zip.clone())).unwrap();
    let mut names: Vec<String> = archive
        .file_names()
        .map(|n| n.unwrap().into_owned())
        .collect();
    names.sort();
    assert_eq!(names.len(), 3, "{names:?}");
    assert!(names.contains(&"recipes.json".to_string()));
    let m: Value = serde_json::from_reader(archive.by_name("recipes.json").unwrap()).unwrap();
    assert_eq!(
        (m["format"].as_str(), m["version"].as_i64()),
        (Some("recipe-box-export"), Some(1))
    );
    assert_eq!(m["recipes"].as_array().unwrap().len(), 2);

    let b = TestApp::spawn_as_admin().await;
    let res = import(&b, &zip).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json, json!({"imported": 2, "skipped": 0}));

    let list = b.get("/api/recipes?limit=200", &b.cookie).await;
    assert_eq!(list.json["total"], 2);
    let id_of = |app_list: &Value, title: &str| {
        app_list["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["title"] == title)
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string()
    };
    let a_list = a.get("/api/recipes?limit=200", &a.cookie).await.json;
    for title in ["Soup", "Plain toast"] {
        let ra = a
            .get(
                &format!("/api/recipes/{}", id_of(&a_list, title)),
                &a.cookie,
            )
            .await
            .json;
        let rb = b
            .get(
                &format!("/api/recipes/{}", id_of(&list.json, title)),
                &b.cookie,
            )
            .await
            .json;
        assert_ne!(ra["id"], rb["id"], "ids are new");
        assert_eq!(essence(&ra), essence(&rb), "{title}");
        assert_eq!(rb["createdBy"]["displayName"], "Admin");
        // Photos: same order, same picture (re-encoded like any upload, so compare pixels, not bytes).
        let (ua, ub) = (
            ra["photoUrls"].as_array().unwrap(),
            rb["photoUrls"].as_array().unwrap(),
        );
        assert_eq!(ua.len(), ub.len());
        for (x, y) in ua.iter().zip(ub) {
            let (wa, ha, pa) = pixels(&a.get(x.as_str().unwrap(), &a.cookie).await.bytes);
            let (wb, hb, pb) = pixels(&b.get(y.as_str().unwrap(), &b.cookie).await.bytes);
            assert_eq!((wa, ha), (wb, hb));
            let diff: u64 = pa.iter().zip(&pb).map(|(p, q)| p.abs_diff(*q) as u64).sum();
            assert!(diff / (pa.len() as u64) < 4, "photos differ");
        }
        assert_eq!(ra["imageUrl"].is_null(), rb["imageUrl"].is_null());
        if title == "Soup" {
            assert_eq!(rb["photoImageIds"].as_array().unwrap().len(), 2);
            assert_eq!(
                rb["imageId"], rb["photoImageIds"][0],
                "main photo is still the first"
            );
            assert!(!rb["photoImageIds"].to_string().contains(p1.as_str()));
        }
    }

    // Importing into the box it came from changes nothing: every id exists.
    let res = import(&a, &zip).await;
    assert_eq!(res.json, json!({"imported": 0, "skipped": 2}));
    assert_eq!(recipe_count(&a).await, 2);
}

#[tokio::test]
async fn only_admins_may_export_or_import_and_only_when_signed_in() {
    let app = TestApp::spawn_as_admin().await;
    app.create_user(&app.cookie, a_user()).await;
    let member = app.login("member", common::MEMBER_PASSWORD).await.session();
    let zip = zip_of(&[("recipes.json", &manifest(json!([])))]);
    for cookie in [&member, &String::new()] {
        let (want, code) = if cookie.is_empty() {
            (StatusCode::UNAUTHORIZED, "unauthenticated")
        } else {
            (StatusCode::FORBIDDEN, "forbidden")
        };
        app.get("/api/export", cookie)
            .await
            .assert_error(want, code);
        app.upload("/api/import/export", cookie, "b.zip", &zip)
            .await
            .assert_error(want, code);
    }
    // A multipart body without the `file` field.
    let body = "--B\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nx\r\n--B--\r\n";
    let req = axum::http::Request::post("/api/import/export")
        .header(axum::http::header::COOKIE, &app.cookie)
        .header(
            axum::http::header::CONTENT_TYPE,
            "multipart/form-data; boundary=B",
        )
        .body(axum::body::Body::from(body))
        .unwrap();
    app.send(req)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
}

#[tokio::test]
async fn an_empty_box_exports_a_valid_archive_and_imports_back_to_nothing() {
    let app = TestApp::spawn_as_admin().await;
    let zip = export(&app).await.bytes;
    let res = import(&app, &zip).await;
    assert_eq!(res.json, json!({"imported": 0, "skipped": 0}));
}

#[tokio::test]
async fn malformed_archives_are_rejected_cleanly() {
    let app = TestApp::spawn_as_admin().await;
    let good = manifest(json!([recipe_json("Ok")]));
    let mut cut = zip_of(&[("recipes.json", &good)]);
    cut.truncate(cut.len() - 10);
    let cases: Vec<(&str, Vec<u8>)> = vec![
        ("not a zip", b"hello, this is not a zip".to_vec()),
        ("empty file", vec![]),
        ("truncated", cut),
        ("no manifest", zip_of(&[("readme.txt", b"hi")])),
        ("bad json", zip_of(&[("recipes.json", b"{nope")])),
        (
            "wrong format",
            zip_of(&[(
                "recipes.json",
                br#"{"format":"other","version":1,"recipes":[]}"#,
            )]),
        ),
        (
            "future version",
            zip_of(&[(
                "recipes.json",
                br#"{"format":"recipe-box-export","version":2,"recipes":[]}"#,
            )]),
        ),
        (
            "version zero",
            zip_of(&[(
                "recipes.json",
                br#"{"format":"recipe-box-export","version":0,"recipes":[]}"#,
            )]),
        ),
        (
            "recipes not a list",
            zip_of(&[(
                "recipes.json",
                br#"{"format":"recipe-box-export","version":1,"recipes":5}"#,
            )]),
        ),
        (
            "recipe without title",
            zip_of(&[("recipes.json", &manifest(json!([{"id": Uuid::new_v4()}])))]),
        ),
        (
            "recipe id not a uuid",
            zip_of(&[(
                "recipes.json",
                &manifest(json!([{"id": "1", "title": "x"}])),
            )]),
        ),
        (
            "blank title",
            zip_of(&[("recipes.json", &manifest(json!([recipe_json("  ")])))]),
        ),
        (
            "too-long title",
            zip_of(&[(
                "recipes.json",
                &manifest(json!([recipe_json(&"x".repeat(301))])),
            )]),
        ),
        (
            "bad source url",
            zip_of(&[(
                "recipes.json",
                &manifest(
                    json!([{"id": Uuid::new_v4(), "title": "x", "sourceUrl": "javascript:alert(1)"}]),
                ),
            )]),
        ),
        (
            "negative minutes",
            zip_of(&[(
                "recipes.json",
                &manifest(json!([{"id": Uuid::new_v4(), "title": "x", "cookMinutes": -5}])),
            )]),
        ),
        (
            "photo missing from the archive",
            zip_of(&[(
                "recipes.json",
                &manifest(
                    json!([{"id": Uuid::new_v4(), "title": "x", "photoImageIds": [Uuid::new_v4()]}]),
                ),
            )]),
        ),
    ];
    for (what, zip) in cases {
        let res = import(&app, &zip).await;
        res.assert_error(StatusCode::BAD_REQUEST, "validation");
        assert!(
            !res.json["error"]["message"].as_str().unwrap().is_empty(),
            "{what}"
        );
        assert_eq!(recipe_count(&app).await, 0, "{what}");
        assert_eq!(media_files(&app), 0, "{what}");
    }
}

#[tokio::test]
async fn paths_that_could_escape_are_refused() {
    let app = TestApp::spawn_as_admin().await;
    let m = manifest(json!([]));
    let evil = [
        "../evil.txt",
        "media/../../evil.jpg",
        "/etc/passwd",
        "media//x.jpg",
        "C:\\evil.jpg",
        "media/x.jpg",
        "other/a.txt",
        "recipes.json/../recipes.json",
    ];
    for name in evil {
        let zip = zip_of(&[("recipes.json", &m), (name, b"x")]);
        let res = import(&app, &zip).await;
        res.assert_error(StatusCode::BAD_REQUEST, "validation");
        assert_eq!(media_files(&app), 0, "{name}");
    }
    // Nothing from inside an archive is ever used as a path: the temp dir and media dir hold no stray files.
    assert!(!std::path::Path::new("/etc/passwd.jpg").exists());
}

#[tokio::test]
async fn a_photo_that_is_not_an_image_fails_the_whole_import() {
    let app = TestApp::spawn_as_admin().await;
    let (good, bad) = (Uuid::new_v4(), Uuid::new_v4());
    let m = manifest(json!([
        {"id": Uuid::new_v4(), "title": "Fine", "photoImageIds": [good]},
        {"id": Uuid::new_v4(), "title": "Broken", "photoImageIds": [bad]},
    ]));
    let g = jpeg(20, 20, 9);
    let zip = zip_of(&[
        ("recipes.json", &m),
        (&format!("media/{good}.jpg"), &g),
        (&format!("media/{bad}.jpg"), b"<html>not an image</html>"),
    ]);
    import(&app, &zip)
        .await
        .assert_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media");
    assert_eq!(recipe_count(&app).await, 0);
    assert_eq!(
        media_files(&app),
        0,
        "the photo stored before the bad one is removed again"
    );
    let images: i64 = sqlx::query_scalar("select count(*) from images")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(images, 0);
}

#[tokio::test]
async fn one_invalid_recipe_keeps_the_valid_ones_out_too() {
    let app = TestApp::spawn_as_admin().await;
    let m = manifest(json!([recipe_json("Good"), recipe_json("")]));
    let res = import(&app, &zip_of(&[("recipes.json", &m)])).await;
    res.assert_error(StatusCode::BAD_REQUEST, "validation");
    assert_eq!(recipe_count(&app).await, 0);
}

#[tokio::test]
async fn imported_ids_and_owners_are_never_trusted() {
    let app = TestApp::spawn_as_admin().await;
    let id = Uuid::new_v4();
    let m = manifest(json!([{
        "id": id, "title": "Sneaky", "createdBy": {"id": Uuid::new_v4(), "displayName": "Mallory"},
        "createdAt": "2001-01-01T00:00:00Z", "role": "admin", "imageUrl": "https://evil.example/x.jpg"
    }]));
    import(&app, &zip_of(&[("recipes.json", &m)]))
        .await
        .assert_status(StatusCode::OK);
    let list = app.get("/api/recipes", &app.cookie).await;
    let r = app
        .get(
            &format!(
                "/api/recipes/{}",
                list.json["items"][0]["id"].as_str().unwrap()
            ),
            &app.cookie,
        )
        .await
        .json;
    assert_ne!(r["id"], id.to_string());
    assert_eq!(r["createdBy"]["displayName"], "Admin");
    assert!(r["createdAt"].as_str().unwrap().starts_with("2026"));
    assert!(r["imageUrl"].is_null());
}

#[tokio::test]
async fn a_zip_bomb_is_refused_without_expanding_it() {
    let app = TestApp::spawn_as_admin().await;
    // ~20 MB of zeros deflates to ~20 KB: well inside the upload limit, far over the per-photo limit.
    let id = Uuid::new_v4();
    let zeros = vec![0u8; 20 << 20];
    let m = manifest(json!([{"id": Uuid::new_v4(), "title": "Bomb", "photoImageIds": [id]}]));
    let zip = zip_of(&[("recipes.json", &m), (&format!("media/{id}.jpg"), &zeros)]);
    assert!(zip.len() < 1 << 20, "{}", zip.len());
    import(&app, &zip)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    assert_eq!(recipe_count(&app).await, 0);
    assert_eq!(media_files(&app), 0);
}

#[tokio::test]
async fn an_upload_over_the_backup_limit_is_too_large() {
    let app = TestApp::spawn_as_admin().await;
    // The test app allows 8 MB.
    let big = vec![7u8; 9 << 20];
    import(&app, &big)
        .await
        .assert_error(StatusCode::PAYLOAD_TOO_LARGE, "too_large");
}

#[tokio::test]
async fn a_large_archive_streams_with_many_photos() {
    let app = TestApp::spawn_as_admin().await;
    let mut ids = Vec::new();
    for i in 0..12 {
        ids.push(upload_photo(&app, &jpeg(48, 48, i * 10)).await);
    }
    app.post(
        "/api/recipes",
        &app.cookie,
        json!({"title": "Album", "imageId": ids[0], "photoImageIds": ids, "ingredients": [], "steps": [], "tags": []}),
    )
    .await
    .assert_status(StatusCode::CREATED);
    let zip = export(&app).await.bytes;
    let b = TestApp::spawn_as_admin().await;
    import(&b, &zip).await.assert_status(StatusCode::OK);
    let list = b.get("/api/recipes", &b.cookie).await;
    let r = b
        .get(
            &format!(
                "/api/recipes/{}",
                list.json["items"][0]["id"].as_str().unwrap()
            ),
            &b.cookie,
        )
        .await
        .json;
    assert_eq!(r["photoImageIds"].as_array().unwrap().len(), 12);
}
