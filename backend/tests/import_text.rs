//! `POST /api/import/text` and the AI fallback of `POST /api/import/url` (LNK-3/4). The AI provider is a local
//! mock; pages come from a local site (the fetch policy opens only that one port).

mod common;

use axum::{Router, http::StatusCode, response::Html, routing::get};
use common::{
    Res, TestApp, a_recipe,
    anthropic::{MockAnthropic, pancakes, tool_reply},
};
use recipe_box_api::import::{ai::MAX_TEXT_INPUT_CHARS, safe_fetch::FetchPolicy};
use serde_json::{Value, json};

const LD_HTML: &str = include_str!("fixtures/wprm-graph.html");
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

/// A local site; returns its base URL and port.
async fn site() -> (String, u16) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let ld = LD_HTML.replace(PHOTO_URL, "data:image/png;base64,AAAA");
    let app = Router::new()
        .route("/ld", get(move || async move { Html(ld) }))
        .route("/article", get(|| async { Html(ARTICLE) }));
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://127.0.0.1:{port}"), port)
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
