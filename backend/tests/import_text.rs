//! `POST /api/import/text` and the AI fallback of `POST /api/import/url` (LNK-3/4). The AI provider is a local
//! mock; pages come from a local site (the fetch policy opens only that one port).

mod common;

use std::{
    io::Cursor,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use axum::{
    Router,
    http::{StatusCode, header},
    response::Html,
    routing::get,
};
use common::{
    Res, TestApp, a_recipe,
    anthropic::{MockAnthropic, error_reply, pancakes, tool_reply},
};
use recipe_box_api::import::{ai::MAX_TEXT_INPUT_CHARS, safe_fetch::FetchPolicy};
use serde_json::{Value, json};

const LD_HTML: &str = include_str!("fixtures/wprm-graph.html");
const MICRO_HTML: &str = include_str!("fixtures/microdata.html");
const NO_RECIPE_HTML: &str = include_str!("fixtures/no-recipe.html");
const PHOTO_URL: &str =
    "https://saltandthyme.example/wp-content/uploads/2024/03/brown-butter-pasta.jpg";

const ARTICLE: &str = "<html><head><title>Grandma's Pasta</title>\
<script>var trackingSecret = 'zz-script-zz';</script></head><body>\
<nav>zz-nav-zz Home Recipes About</nav>\
<main><h1>Grandma's Pasta</h1>\
<p>Boil the pasta in plenty of salted water until just tender, then drain it and keep a cup of the cooking water.</p>\
<h2>For the sauce</h2><p>Melt the butter in a wide pan, add the garlic and the sage, and let them sizzle gently.</p>\
<p>Toss the pasta through the butter with a splash of the cooking water until glossy, then serve at once.</p></main>\
</body></html>";

fn png() -> Vec<u8> {
    let mut out = Vec::new();
    image::DynamicImage::new_rgb8(64, 48)
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

/// A local site; returns its base URL and port.
async fn site() -> (String, u16) {
    let (base, port, _) = site_counted().await;
    (base, port)
}

/// Like [`site`], plus how many times `/seen` was requested.
async fn site_counted() -> (String, u16, Arc<AtomicUsize>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base = format!("http://127.0.0.1:{port}");
    let ld = LD_HTML.replace(PHOTO_URL, "data:image/png;base64,AAAA");
    let seen = Arc::new(AtomicUsize::new(0));
    let counter = seen.clone();
    // Same article, with a photo on this site, and with a photo on a port the fetch policy does not open.
    let with_image = |src: String| {
        ARTICLE.replace(
            "<head>",
            &format!("<head><meta property=\"og:image\" content=\"{src}\">"),
        )
    };
    let (own_image, blocked_image) = (
        with_image(format!("{base}/p.png")),
        with_image("http://127.0.0.1:1/p.png".into()),
    );
    let deep = format!("<html><body>{}</body></html>", "<div></x>".repeat(30_000));
    let app = Router::new()
        .route("/ld", get(move || async move { Html(ld) }))
        .route("/micro", get(|| async { Html(MICRO_HTML) }))
        .route("/empty", get(|| async { Html(NO_RECIPE_HTML) }))
        .route("/deep", get(move || async move { Html(deep) }))
        .route("/article", get(|| async { Html(ARTICLE) }))
        .route("/article-img", get(move || async move { Html(own_image) }))
        .route(
            "/article-blocked-img",
            get(move || async move { Html(blocked_image) }),
        )
        .route(
            "/p.png",
            get(|| async { ([(header::CONTENT_TYPE, "image/png")], png()) }),
        )
        .route(
            "/seen",
            get(move || async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Html("seen")
            }),
        );
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (base, port, seen)
}

async fn app_with(
    replies: Vec<common::anthropic::Canned>,
    port: Option<u16>,
) -> (TestApp, MockAnthropic) {
    let mock = MockAnthropic::start(replies).await;
    let app = TestApp::spawn_as_admin_with(|s| {
        mock.enable_ai(s);
        if let Some(port) = port {
            s.fetch_policy = FetchPolicy::allow_loopback_port_for_tests(port);
        }
    })
    .await;
    (app, mock)
}

async fn text(app: &TestApp, body: Value) -> Res {
    app.post("/api/import/text", &app.cookie, body).await
}

async fn url(app: &TestApp, url: &str) -> Res {
    app.post("/api/import/url", &app.cookie, json!({ "url": url }))
        .await
}

#[tokio::test]
async fn headings_become_sections_and_the_text_reaches_the_model() {
    let mut reply = pancakes();
    reply["ingredients"] = json!([
        { "text": "200 g pasta", "section": null },
        { "text": "50 g butter", "section": "For the sauce" },
    ]);
    reply["steps"] = json!([{ "text": "Melt the butter.", "section": "For the sauce" }]);
    let (app, mock) = app_with(vec![tool_reply(reply)], None).await;
    let pasted = "Pasta\n200 g pasta\nFor the sauce\n50 g butter\nMelt the butter.";
    let res = text(&app, json!({ "text": pasted })).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["sourceType"], "text");
    assert_eq!(res.json["ingredients"][1]["section"], "For the sauce");
    assert_eq!(res.json["steps"][0]["section"], "For the sauce");
    assert!(mock.prompt(0).contains(pasted));
    assert_eq!(mock.requests().len(), 1);
    // What the route can control: the model is asked for sections, in the instructions and in the tool schema.
    let body = &mock.requests()[0].body;
    assert!(body["system"].to_string().contains("`section`"), "{body}");
    let schema = &body["tools"][0]["input_schema"]["properties"];
    for field in ["ingredients", "steps"] {
        assert!(
            schema[field]["items"]["properties"]["section"].is_object(),
            "{field}: {schema}"
        );
    }
}

#[tokio::test]
async fn without_ai_text_import_is_ai_disabled() {
    let app = TestApp::spawn_as_admin().await;
    text(&app, json!({ "text": "1 egg" }))
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "ai_disabled");
}

#[tokio::test]
async fn blank_text_is_a_validation_error_and_signed_out_is_401() {
    let (app, mock) = app_with(vec![], None).await;
    for body in [json!({ "text": "  \n " }), json!({ "text": "" })] {
        text(&app, body)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    text(
        &app,
        json!({ "text": "x", "sourceUrl": "javascript:alert(1)" }),
    )
    .await
    .assert_error(StatusCode::BAD_REQUEST, "validation");
    let signed_out = app
        .post("/api/import/text", "", json!({ "text": "1 egg" }))
        .await;
    signed_out.assert_status(StatusCode::UNAUTHORIZED);
    assert!(mock.requests().is_empty());
}

#[tokio::test]
async fn source_url_is_cleaned_and_flags_a_duplicate() {
    let (app, _mock) = app_with(vec![tool_reply(pancakes())], None).await;
    let saved = app
        .create_recipe(&app.cookie, a_recipe().titled("Saved"))
        .await;
    saved.assert_status(StatusCode::CREATED);
    let id = saved.json["id"].as_str().unwrap().to_string();
    sqlx::query(
        "update recipes set source_url = 'https://cooks.example/pancakes' where id = $1::uuid",
    )
    .bind(&id)
    .execute(&app.pool)
    .await
    .unwrap();
    let res = text(
        &app,
        json!({ "text": "pancakes", "sourceUrl": "https://user:pw@cooks.example/pancakes#step-2" }),
    )
    .await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["sourceUrl"], "https://cooks.example/pancakes");
    assert_eq!(res.json["sourceType"], "text");
    assert_eq!(res.json["duplicateOf"], id);
}

#[tokio::test]
async fn very_long_text_is_cut_with_a_warning() {
    let (app, mock) = app_with(vec![tool_reply(pancakes())], None).await;
    let long = "a".repeat(MAX_TEXT_INPUT_CHARS + 10);
    let res = text(&app, json!({ "text": long })).await;
    res.assert_status(StatusCode::OK);
    assert!(
        res.json["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|w| w.as_str().unwrap().contains("only the first")),
        "{}",
        res.json
    );
    let sent = mock.prompt(0);
    assert!(sent.contains(&"a".repeat(MAX_TEXT_INPUT_CHARS)));
    assert!(!sent.contains(&"a".repeat(MAX_TEXT_INPUT_CHARS + 1)));
}

#[tokio::test]
async fn a_page_with_recipe_data_never_calls_the_model() {
    let (base, port) = site().await;
    let (app, mock) = app_with(vec![], Some(port)).await;
    let res = url(&app, &format!("{base}/ld")).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["title"], "Brown Butter Pasta with Sage");
    assert!(mock.requests().is_empty());
}

#[tokio::test]
async fn a_page_without_recipe_data_is_read_by_the_model() {
    let (base, port) = site().await;
    let mut reply = pancakes();
    reply["title"] = json!("Grandma's Pasta");
    let (app, mock) = app_with(vec![tool_reply(reply)], Some(port)).await;
    let res = url(&app, &format!("{base}/article#top")).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["sourceType"], "link");
    assert_eq!(res.json["sourceUrl"], format!("{base}/article"));
    assert_eq!(res.json["sourceName"], "127.0.0.1");
    assert!(res.json["warnings"].as_array().unwrap().iter().any(|w| {
        w.as_str()
            .unwrap()
            .starts_with("Read from the page text by AI")
    }));
    assert_eq!(mock.requests().len(), 1);
    let sent = mock.prompt(0);
    assert!(sent.contains("For the sauce") && sent.contains("Melt the butter"));
    assert!(!sent.contains("zz-script-zz") && !sent.contains("zz-nav-zz"));
}

#[tokio::test]
async fn the_same_page_without_ai_is_no_recipe_found() {
    let (base, port) = site().await;
    let app = TestApp::spawn_as_admin_with(|s| {
        s.fetch_policy = FetchPolicy::allow_loopback_port_for_tests(port);
    })
    .await;
    url(&app, &format!("{base}/article"))
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found");
}

#[tokio::test]
async fn the_model_finding_no_recipe_on_a_page_is_no_recipe_found() {
    let (base, port) = site().await;
    let (app, mock) = app_with(vec![tool_reply(json!({ "found": false }))], Some(port)).await;
    let res = url(&app, &format!("{base}/article")).await;
    res.assert_error(StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found");
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .contains("paste the recipe text")
    );
    assert_eq!(mock.requests().len(), 1);
}

#[tokio::test]
async fn a_microdata_only_page_is_read_without_the_model() {
    let (base, port) = site().await;
    let (app, mock) = app_with(vec![], Some(port)).await;
    let res = url(&app, &format!("{base}/micro")).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["sourceType"], "link");
    assert_eq!(res.json["title"], "Grandma\u{2019}s Lentil Stew");
    assert!(mock.requests().is_empty());
}

#[tokio::test]
async fn a_failing_provider_is_a_502_on_both_routes() {
    let (base, port) = site().await;
    let (app, mock) = app_with((0..4).map(|_| error_reply(500)).collect(), Some(port)).await;
    text(&app, json!({ "text": "1 egg" }))
        .await
        .assert_error(StatusCode::BAD_GATEWAY, "ai_error");
    assert_eq!(mock.requests().len(), 2); // one retry
    url(&app, &format!("{base}/article"))
        .await
        .assert_error(StatusCode::BAD_GATEWAY, "ai_error");
    assert_eq!(mock.requests().len(), 4);
}

#[tokio::test]
async fn source_url_is_never_fetched() {
    let (base, port, seen) = site_counted().await;
    let (app, _mock) = app_with(vec![tool_reply(pancakes())], Some(port)).await;
    let given = format!("{base}/seen");
    let res = text(&app, json!({ "text": "pancakes", "sourceUrl": given })).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["sourceUrl"], given);
    assert_eq!(seen.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn thin_or_too_complex_pages_never_reach_the_model() {
    let (base, port) = site().await;
    let (app, mock) = app_with(vec![tool_reply(pancakes())], Some(port)).await;
    // A near-empty page is below the text minimum.
    url(&app, &format!("{base}/empty"))
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found");
    // Stray end tags hide a 30,000-deep DOM from a naive depth count; the page is refused, nothing crashes.
    url(&app, &format!("{base}/deep"))
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found");
    assert!(mock.requests().is_empty());
    // The process is still serving and the fallback still works.
    url(&app, &format!("{base}/article"))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(mock.requests().len(), 1);
}

#[tokio::test]
async fn the_fallback_flags_duplicates_even_with_credentials_and_stores_the_photo() {
    let (base, port) = site().await;
    let (app, _mock) = app_with(vec![tool_reply(pancakes())], Some(port)).await;
    let saved = app
        .create_recipe(&app.cookie, a_recipe().titled("Saved"))
        .await;
    saved.assert_status(StatusCode::CREATED);
    let id = saved.json["id"].as_str().unwrap().to_string();
    sqlx::query("update recipes set source_url = $2 where id = $1::uuid")
        .bind(&id)
        .bind(format!("{base}/article-img"))
        .execute(&app.pool)
        .await
        .unwrap();
    let with_creds = base.replace("http://", "http://u:pw@");
    let res = url(&app, &format!("{with_creds}/article-img")).await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["duplicateOf"], id);
    assert_eq!(res.json["sourceUrl"], format!("{base}/article-img"));
    assert!(res.json["imageId"].is_string(), "{}", res.json);
    assert!(
        res.json["imageUrl"]
            .as_str()
            .unwrap()
            .starts_with("/media/")
    );
}

#[tokio::test]
async fn an_og_image_outside_the_allowed_hosts_is_not_fetched_and_only_warns() {
    let (base, port) = site().await;
    let (app, _mock) = app_with(vec![tool_reply(pancakes())], Some(port)).await;
    let res = url(&app, &format!("{base}/article-blocked-img")).await;
    res.assert_status(StatusCode::OK);
    assert!(res.json["imageId"].is_null() && res.json["imageUrl"].is_null());
    assert!(res.json["warnings"].as_array().unwrap().iter().any(|w| {
        w.as_str()
            .unwrap()
            .contains("photo could not be downloaded")
    }));
}

#[tokio::test]
async fn text_of_exactly_the_limit_is_not_cut_or_warned() {
    let (app, _mock) = app_with(vec![tool_reply(pancakes())], None).await;
    let res = text(&app, json!({ "text": "a".repeat(MAX_TEXT_INPUT_CHARS) })).await;
    res.assert_status(StatusCode::OK);
    assert!(
        !res.json["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|w| w.as_str().unwrap().contains("only the first"))
    );
}
