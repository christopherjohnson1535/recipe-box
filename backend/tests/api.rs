//! Integration tests against a real Postgres through the shared harness in `common/`.

mod common;

use std::io::Cursor;

use axum::http::{Method, StatusCode};
use common::TestApp;
use serde_json::{Value, json};
use uuid::Uuid;

fn png(w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::new();
    image::DynamicImage::new_rgb8(w, h)
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

#[tokio::test]
async fn health_ok() {
    let ctx = TestApp::spawn().await;
    let res = ctx.call(Method::GET, "/api/health", None, None).await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.json["db"], "ok");
    let res = ctx.call(Method::GET, "/api/nope", None, None).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::NOT_FOUND, "not_found")
    );
}

#[tokio::test]
async fn setup_once_then_forbidden() {
    let ctx = TestApp::spawn().await;
    let res = ctx.call(Method::GET, "/api/setup", None, None).await;
    assert_eq!(res.json, json!({ "needsSetup": true }));

    let short = json!({ "username": "admin", "displayName": "Admin", "password": "short" });
    let res = ctx
        .call(Method::POST, "/api/setup", None, Some(short))
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );
    let res = ctx
        .call(
            Method::POST,
            "/api/setup",
            None,
            Some(json!({ "username": "admin" })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );

    let cookie = ctx.setup_admin().await;
    let me = ctx
        .call(Method::GET, "/api/auth/me", Some(&cookie), None)
        .await;
    assert_eq!(me.json["role"], "admin");
    assert_eq!(me.json["displayName"], "Admin");
    assert!(me.json.get("passwordHash").is_none());

    let res = ctx.call(Method::GET, "/api/setup", None, None).await;
    assert_eq!(res.json, json!({ "needsSetup": false }));
    let again =
        json!({ "username": "other", "displayName": "Other", "password": "another long password" });
    let res = ctx
        .call(Method::POST, "/api/setup", None, Some(again))
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::FORBIDDEN, "forbidden")
    );
}

#[tokio::test]
async fn login_logout_and_me() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;

    let res = ctx.call(Method::GET, "/api/auth/me", None, None).await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNAUTHORIZED, "unauthenticated")
    );
    let res = ctx
        .call(Method::GET, "/api/auth/me", Some("rb_session=bogus"), None)
        .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);

    let wrong = ctx
        .call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": "admin", "password": "nope nope nope" })),
        )
        .await;
    assert_eq!(
        (wrong.status, wrong.code()),
        (StatusCode::UNAUTHORIZED, "unauthenticated")
    );
    let unknown = ctx
        .call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": "ghost", "password": "nope nope nope" })),
        )
        .await;
    assert_eq!(unknown.json, wrong.json, "same answer for unknown user");

    let good = ctx
        .call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": "ADMIN", "password": "correct horse battery" })),
        )
        .await;
    assert_eq!(good.status, StatusCode::OK);
    assert_eq!(good.json["username"], "admin");
    let cookie = good.session();
    let me = ctx
        .call(Method::GET, "/api/auth/me", Some(&cookie), None)
        .await;
    assert_eq!(me.status, StatusCode::OK);

    let out = ctx
        .call(Method::POST, "/api/auth/logout", Some(&cookie), None)
        .await;
    assert_eq!(out.status, StatusCode::NO_CONTENT);
    assert!(out.cookie.unwrap().contains("rb_session="));
    let me = ctx
        .call(Method::GET, "/api/auth/me", Some(&cookie), None)
        .await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn recipe_crud_list_delete_restore() {
    let ctx = TestApp::spawn().await;
    let c = ctx.setup_admin().await;
    let c = Some(c.as_str());

    let res = ctx.call(Method::GET, "/api/recipes", None, None).await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
    let res = ctx
        .call(
            Method::POST,
            "/api/recipes",
            c,
            Some(json!({ "title": "  " })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::BAD_REQUEST, "validation")
    );
    let res = ctx
        .call(
            Method::POST,
            "/api/recipes",
            c,
            Some(json!({ "title": "x", "sourceUrl": "ftp://a.b" })),
        )
        .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);
    let res = ctx
        .call(
            Method::POST,
            "/api/recipes",
            c,
            Some(json!({ "title": "x", "imageId": Uuid::new_v4() })),
        )
        .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);

    let body = json!({
        "title": " Pancakes ",
        "ingredients": [{ "text": "2 cups flour", "section": "Batter" }, { "text": " " }],
        "steps": [{ "text": "Mix.", "section": null }],
        "prepMinutes": 5, "totalMinutes": 20,
        "sourceUrl": "https://example.com/pancakes",
        "tags": [" Breakfast ", "breakfast", "Quick"]
    });
    let created = ctx.call(Method::POST, "/api/recipes", c, Some(body)).await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.json);
    let r = &created.json;
    assert_eq!(r["title"], "Pancakes");
    assert_eq!(
        r["ingredients"],
        json!([{ "text": "2 cups flour", "section": "Batter" }])
    );
    assert_eq!(r["tags"], json!(["breakfast", "quick"]));
    assert_eq!(r["sourceType"], "manual");
    assert_eq!(r["createdBy"]["displayName"], "Admin");
    assert_eq!(r["imageUrl"], Value::Null);
    assert_eq!(r["photoUrls"], json!([]));
    let id = r["id"].as_str().unwrap().to_string();

    let got = ctx
        .call(Method::GET, &format!("/api/recipes/{id}"), c, None)
        .await;
    assert_eq!(got.json, created.json);

    let upd = ctx
        .call(
            Method::PUT,
            &format!("/api/recipes/{id}"),
            c,
            Some(
                json!({ "title": "Fluffy pancakes", "tags": ["breakfast"], "sourceType": "link" }),
            ),
        )
        .await;
    assert_eq!(upd.status, StatusCode::OK);
    assert_eq!(upd.json["title"], "Fluffy pancakes");
    assert_eq!(upd.json["tags"], json!(["breakfast"]));
    assert_eq!(upd.json["ingredients"], json!([]), "PUT is a full replace");
    assert_eq!(upd.json["sourceType"], "link");

    ctx.call(
        Method::POST,
        "/api/recipes",
        c,
        Some(json!({ "title": "Soup", "tags": ["dinner"] })),
    )
    .await;

    let list = ctx.call(Method::GET, "/api/recipes", c, None).await;
    assert_eq!(list.json["total"], 2);
    assert_eq!(list.json["items"][0]["title"], "Soup", "newest first");
    let list = ctx
        .call(Method::GET, "/api/recipes?tag=Breakfast", c, None)
        .await;
    assert_eq!(list.json["total"], 1);
    assert_eq!(list.json["items"][0]["id"], id.as_str());
    assert_eq!(list.json["items"][0]["tags"], json!(["breakfast"]));
    let list = ctx
        .call(
            Method::GET,
            "/api/recipes?limit=1&offset=1&sort=newest",
            c,
            None,
        )
        .await;
    assert_eq!(list.json["total"], 2);
    assert_eq!(list.json["items"].as_array().unwrap().len(), 1);
    assert_eq!(list.json["items"][0]["id"], id.as_str());
    let list = ctx
        .call(Method::GET, "/api/recipes?sort=title", c, None)
        .await;
    assert_eq!(list.json["items"][0]["title"], "Fluffy pancakes");
    for bad in [
        "limit=0",
        "limit=201",
        "offset=-1",
        "sort=random",
        "limit=abc",
    ] {
        let res = ctx
            .call(Method::GET, &format!("/api/recipes?{bad}"), c, None)
            .await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation"),
            "{bad}"
        );
    }

    let del = ctx
        .call(Method::DELETE, &format!("/api/recipes/{id}"), c, None)
        .await;
    assert_eq!(del.status, StatusCode::NO_CONTENT);
    let got = ctx
        .call(Method::GET, &format!("/api/recipes/{id}"), c, None)
        .await;
    assert_eq!(
        (got.status, got.code()),
        (StatusCode::NOT_FOUND, "not_found")
    );
    let list = ctx.call(Method::GET, "/api/recipes", c, None).await;
    assert_eq!(list.json["total"], 1);

    let restored = ctx
        .call(Method::POST, &format!("/api/recipes/{id}/restore"), c, None)
        .await;
    assert_eq!(restored.status, StatusCode::OK);
    assert_eq!(restored.json["title"], "Fluffy pancakes");

    ctx.call(Method::DELETE, &format!("/api/recipes/{id}"), c, None)
        .await;
    ctx.clock.advance(chrono::Duration::minutes(11));
    let late = ctx
        .call(Method::POST, &format!("/api/recipes/{id}/restore"), c, None)
        .await;
    assert_eq!(
        (late.status, late.code()),
        (StatusCode::CONFLICT, "conflict")
    );

    let missing = ctx
        .call(
            Method::GET,
            &format!("/api/recipes/{}", Uuid::new_v4()),
            c,
            None,
        )
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn nul_bytes_in_recipe_text_are_dropped() {
    let ctx = TestApp::spawn().await;
    let c = ctx.setup_admin().await;
    let res = ctx
        .call(
            Method::POST,
            "/api/recipes",
            Some(c.as_str()),
            Some(json!({
                "title": "So\u{0}up", "description": "a\u{0}b", "notes": "n\u{0}",
                "ingredients": [{ "text": "1 on\u{0}ion", "section": "s\u{0}" }],
                "steps": [{ "text": "boil\u{0}" }], "tags": ["di\u{0}nner"]
            })),
        )
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json);
    assert_eq!(res.json["title"], "Soup");
    assert_eq!(res.json["ingredients"][0]["text"], "1 onion");
    assert_eq!(res.json["tags"], json!(["dinner"]));
}

#[tokio::test]
async fn tags_with_counts() {
    let ctx = TestApp::spawn().await;
    let c = ctx.setup_admin().await;
    let c = Some(c.as_str());
    ctx.call(
        Method::POST,
        "/api/recipes",
        c,
        Some(json!({ "title": "A", "tags": ["dinner", "quick"] })),
    )
    .await;
    ctx.call(
        Method::POST,
        "/api/recipes",
        c,
        Some(json!({ "title": "B", "tags": ["Dinner"] })),
    )
    .await;
    let gone = ctx
        .call(
            Method::POST,
            "/api/recipes",
            c,
            Some(json!({ "title": "C", "tags": ["cake"] })),
        )
        .await;
    let gone_id = gone.json["id"].as_str().unwrap();
    ctx.call(Method::DELETE, &format!("/api/recipes/{gone_id}"), c, None)
        .await;

    let tags = ctx.call(Method::GET, "/api/tags", c, None).await;
    assert_eq!(
        tags.json,
        json!([{ "name": "dinner", "count": 2 }, { "name": "quick", "count": 1 }])
    );
}

#[tokio::test]
async fn media_upload_and_serve() {
    let ctx = TestApp::spawn().await;
    let cookie = ctx.setup_admin().await;

    let res = ctx
        .upload("/api/media", &cookie, "notes.txt", b"just some text")
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media")
    );
    let res = ctx
        .upload(
            "/api/media",
            &cookie,
            "huge.png",
            &vec![0u8; 3 * 1024 * 1024],
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::PAYLOAD_TOO_LARGE, "too_large")
    );

    let res = ctx
        .upload("/api/media", &cookie, "dot.png", &png(40, 30))
        .await;
    assert_eq!(res.status, StatusCode::CREATED, "{}", res.json);
    assert_eq!(
        (res.json["width"].as_i64(), res.json["height"].as_i64()),
        (Some(40), Some(30))
    );
    let url = res.json["url"].as_str().unwrap().to_string();
    let image_id = res.json["id"].as_str().unwrap().to_string();
    assert_eq!(url, format!("/media/{image_id}.jpg"));
    assert!(ctx.media_dir.join(format!("{image_id}.jpg")).exists());

    let img = ctx.call(Method::GET, &url, Some(&cookie), None).await;
    assert_eq!(img.status, StatusCode::OK);
    assert_eq!(img.content_type.as_deref(), Some("image/jpeg"));
    assert_eq!(&img.bytes[..2], &[0xFF, 0xD8]);
    let anon = ctx.call(Method::GET, &url, None, None).await;
    assert_eq!(anon.status, StatusCode::UNAUTHORIZED);
    let bad = ctx
        .call(
            Method::GET,
            "/media/..%2F..%2Fetc%2Fpasswd",
            Some(&cookie),
            None,
        )
        .await;
    assert_eq!(bad.status, StatusCode::NOT_FOUND);

    let recipe = ctx
        .call(
            Method::POST,
            "/api/recipes",
            Some(&cookie),
            Some(
                json!({ "title": "With photo", "imageId": image_id, "photoImageIds": [image_id] }),
            ),
        )
        .await;
    assert_eq!(recipe.status, StatusCode::CREATED);
    assert_eq!(recipe.json["imageUrl"], url.as_str());
    assert_eq!(recipe.json["photoUrls"], json!([url]));
}

#[tokio::test]
async fn capabilities_and_stubs() {
    let ctx = TestApp::spawn().await;
    let cookie = ctx.setup_admin().await;
    let c = Some(cookie.as_str());

    let caps = ctx
        .call(Method::GET, "/api/import/capabilities", c, None)
        .await;
    assert_eq!(caps.json, json!({ "ai": false, "provider": "none" }));

    let stubs = [
        (Method::POST, "/api/import/text".to_string()),
        (Method::GET, "/api/export".to_string()),
        (Method::POST, "/api/import/export".to_string()),
    ];
    for (method, path) in stubs {
        let anon = ctx.call(method.clone(), &path, None, None).await;
        assert_eq!(anon.status, StatusCode::UNAUTHORIZED, "{method} {path}");
        let res = ctx.call(method.clone(), &path, c, None).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::NOT_IMPLEMENTED, "not_implemented"),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn body_limits_field_caps_and_error_shapes() {
    let ctx = TestApp::spawn().await;
    let c = &ctx.setup_admin().await;

    // JSON routes stop at 1 MB; an unauthenticated login cannot buffer more.
    let big = "x".repeat(2 * 1024 * 1024);
    let res = ctx
        .call(
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({ "username": "admin", "password": big })),
        )
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::PAYLOAD_TOO_LARGE, "too_large")
    );
    let res = ctx
        .call(
            Method::POST,
            "/api/recipes",
            Some(c),
            Some(json!({ "title": "t", "description": big })),
        )
        .await;
    assert_eq!(res.status, StatusCode::PAYLOAD_TOO_LARGE);
    // Multipart routes keep the larger limit (a 1.5 MB non-image reaches the decoder: 415, not 413).
    let res = ctx
        .upload("/api/media", c, "a.bin", &vec![0u8; 1536 * 1024])
        .await;
    assert_eq!(res.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);

    // Field caps name the field.
    let long = "x".repeat(10_001);
    for (body, field) in [
        (json!({ "title": "t", "description": long }), "description"),
        (
            json!({ "title": "t", "notes": "x".repeat(20_001) }),
            "notes",
        ),
        (
            json!({ "title": "t", "ingredients": [{ "text": "x".repeat(2_001) }] }),
            "ingredients",
        ),
        (
            json!({ "title": "t", "steps": vec![json!({ "text": "s" }); 501] }),
            "steps",
        ),
        (
            json!({ "title": "t", "tags": (0..51).map(|i| format!("t{i}")).collect::<Vec<_>>() }),
            "tags",
        ),
    ] {
        let res = ctx
            .call(Method::POST, "/api/recipes", Some(c), Some(body))
            .await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation")
        );
        assert!(
            res.json["error"]["message"]
                .as_str()
                .unwrap()
                .starts_with(&format!("{field}:")),
            "{}",
            res.json
        );
    }

    // 405 uses the JSON shape.
    let res = ctx
        .call(Method::PATCH, "/api/recipes/x", Some(c), None)
        .await;
    assert_eq!(
        (res.status, res.code()),
        (StatusCode::METHOD_NOT_ALLOWED, "method_not_allowed")
    );

    // Malformed ids: our message, never the parser's.
    for (m, path) in [
        (Method::GET, "/api/recipes/not-a-uuid"),
        (Method::DELETE, "/api/recipes/not-a-uuid"),
        (Method::POST, "/api/recipes/not-a-uuid/restore"),
        (Method::DELETE, "/api/users/not-a-uuid"),
    ] {
        let res = ctx.call(m, path, Some(c), None).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::BAD_REQUEST, "validation"),
            "{path}"
        );
        assert_eq!(res.json["error"]["message"], "id: not a valid id.");
    }
}

#[tokio::test]
async fn logout_always_clears_the_cookie() {
    let ctx = TestApp::spawn().await;
    ctx.setup_admin().await;
    for cookie in [None, Some("rb_session=expired-or-bogus")] {
        let res = ctx
            .call(Method::POST, "/api/auth/logout", cookie, None)
            .await;
        assert_eq!(res.status, StatusCode::NO_CONTENT);
        assert!(res.cookie.unwrap().contains("rb_session="));
    }
}
