//! Anthropic provider against a local mock of `POST /v1/messages` (no real network, no real waiting).

mod common;

use std::time::Duration;

use base64::{Engine, engine::general_purpose::STANDARD};
use common::anthropic::{MockAnthropic, error_reply, pancakes, tool_reply};
use recipe_box_api::{
    config::{Config, Secret},
    error::AppError,
    import::ai::{Ai, AiProvider, AnthropicProvider, PhotoMode},
    models::SourceType,
};
use serde_json::json;

const KEY: &str = "sk-ant-test-key-12345";

fn provider(mock: &MockAnthropic) -> AnthropicProvider {
    AnthropicProvider::with_base_url(Secret::new(KEY), "test-model".into(), &mock.base_url)
        .unwrap()
        .with_retry_delay_cap(Duration::ZERO)
}

fn jpeg(w: u32, h: u32) -> Vec<u8> {
    let mut out = Vec::new();
    image::RgbImage::from_pixel(w, h, image::Rgb([200, 120, 40]))
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut out, 80,
        ))
        .unwrap();
    out
}

fn ai_error(err: AppError) -> String {
    match err {
        AppError::AiError(m) => m,
        other => panic!("expected ai_error, got {other:?}"),
    }
}

#[tokio::test]
async fn images_round_trip_to_a_draft() {
    let mock = MockAnthropic::start(vec![tool_reply(pancakes())]).await;
    let draft = provider(&mock)
        .recipe_from_images(&[jpeg(2400, 1200), jpeg(800, 600)], PhotoMode::Recipe)
        .await
        .unwrap();
    assert_eq!(draft.title, "Pancakes");
    assert_eq!((draft.ingredients.len(), draft.steps.len()), (2, 2));
    assert_eq!(draft.total_minutes, Some(15));
    assert_eq!(draft.source_type, SourceType::Photo);
    assert!(draft.warnings.is_empty());

    let reqs = mock.requests();
    assert_eq!(reqs.len(), 1);
    let (h, b) = (&reqs[0].headers, &reqs[0].body);
    assert_eq!(h["x-api-key"], KEY);
    assert_eq!(h["anthropic-version"], "2023-06-01");
    assert_eq!(b["model"], "test-model");
    assert_eq!(
        b["tool_choice"],
        json!({ "type": "tool", "name": "record_recipe" })
    );
    assert_eq!(b["tools"][0]["name"], "record_recipe");
    let content = b["messages"][0]["content"].as_array().unwrap();
    assert_eq!(content.len(), 3);
    assert_eq!(content[2]["type"], "text");
    let dims: Vec<_> = content[..2]
        .iter()
        .map(|c| {
            assert_eq!(c["type"], "image");
            assert_eq!(c["source"]["media_type"], "image/jpeg");
            let bytes = STANDARD
                .decode(c["source"]["data"].as_str().unwrap())
                .unwrap();
            image::load_from_memory(&bytes)
                .unwrap()
                .into_rgb8()
                .dimensions()
        })
        .collect();
    assert_eq!(
        dims,
        [(1568, 784), (800, 600)],
        "shrunk to 1568 px, in order"
    );
}

#[tokio::test]
async fn dish_mode_adds_the_guess_warning() {
    let mock = MockAnthropic::start(vec![tool_reply(pancakes())]).await;
    let draft = provider(&mock)
        .recipe_from_images(&[jpeg(100, 100)], PhotoMode::Dish)
        .await
        .unwrap();
    assert_eq!(draft.warnings, ["Guessed from a photo of the dish"]);
}

#[tokio::test]
async fn text_round_trip() {
    let mock = MockAnthropic::start(vec![tool_reply(pancakes())]).await;
    let draft = provider(&mock)
        .recipe_from_text("Pancakes: flour, egg")
        .await
        .unwrap();
    assert_eq!(
        (draft.title.as_str(), draft.source_type),
        ("Pancakes", SourceType::Text)
    );
    let content = &mock.requests()[0].body["messages"][0]["content"];
    assert_eq!(content.as_array().unwrap().len(), 1);
    assert!(
        content[0]["text"]
            .as_str()
            .unwrap()
            .contains("Pancakes: flour, egg")
    );
}

#[tokio::test]
async fn busy_then_ok_retries_once() {
    let mock = MockAnthropic::start(vec![error_reply(529), tool_reply(pancakes())]).await;
    provider(&mock).recipe_from_text("x").await.unwrap();
    assert_eq!(mock.requests().len(), 2);
}

#[tokio::test]
async fn rate_limit_honours_retry_after_then_gives_up_after_two_requests() {
    let mock = MockAnthropic::start(vec![
        error_reply(429).with_header("retry-after", "3"),
        error_reply(500),
        tool_reply(pancakes()),
    ])
    .await;
    let msg = ai_error(provider(&mock).recipe_from_text("x").await.unwrap_err());
    assert_eq!(msg, "The AI service is busy. Try again in a minute.");
    assert_eq!(mock.requests().len(), 2);
}

#[tokio::test]
async fn bad_key_is_not_retried_and_not_echoed() {
    let mock = MockAnthropic::start(vec![error_reply(401), tool_reply(pancakes())]).await;
    let err = provider(&mock).recipe_from_text("x").await.unwrap_err();
    let (status, code) = err.status_and_code();
    assert_eq!(
        (status.as_u16(), format!("{code:?}")),
        (502, "AiError".into())
    );
    let msg = ai_error(err);
    assert_eq!(
        msg,
        "The AI service rejected the API key. Check ANTHROPIC_API_KEY."
    );
    assert!(!msg.contains(KEY));
    assert_eq!(mock.requests().len(), 1);
}

#[tokio::test]
async fn other_client_errors_are_generic_and_not_retried() {
    let mock = MockAnthropic::start(vec![error_reply(400)]).await;
    let msg = ai_error(provider(&mock).recipe_from_text("x").await.unwrap_err());
    assert_eq!(msg, "The AI service could not read this request.");
    assert_eq!(mock.requests().len(), 1);
}

#[tokio::test]
async fn unreachable_service_retries_once_then_says_so() {
    // Bind then drop a listener so the port refuses connections.
    let port = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let p = AnthropicProvider::with_base_url(
        Secret::new(KEY),
        "m".into(),
        &format!("http://127.0.0.1:{port}"),
    )
    .unwrap()
    .with_retry_delay_cap(Duration::ZERO);
    let msg = ai_error(p.recipe_from_text("x").await.unwrap_err());
    assert_eq!(msg, "The AI service did not answer in time. Try again.");
}

#[tokio::test]
async fn unreadable_replies_are_ai_errors() {
    let mut no_tool = tool_reply(json!({}));
    no_tool.body["content"] = json!([{ "type": "text", "text": "Sure! Here is a recipe." }]);
    let mut wrong_tool = tool_reply(pancakes());
    wrong_tool.body["content"][0]["name"] = json!("something_else");
    let not_an_object = tool_reply(json!("oops"));
    let mock = MockAnthropic::start(vec![no_tool, wrong_tool, not_an_object]).await;
    let p = provider(&mock);
    for _ in 0..3 {
        let msg = ai_error(p.recipe_from_text("x").await.unwrap_err());
        assert_eq!(msg, "The AI service sent a reply we could not read.");
    }
}

#[tokio::test]
async fn malformed_tool_input_is_coerced() {
    let mock = MockAnthropic::start(vec![tool_reply(json!({
        "title": 42,
        "ingredients": ["  2 eggs ", {"text": 5}, {"text": "salt", "section": 3}],
        "steps": "not a list",
        "totalMinutes": "25",
        "prepMinutes": -3,
    }))])
    .await;
    let d = provider(&mock).recipe_from_text("x").await.unwrap();
    assert_eq!(d.title, "Untitled recipe");
    assert_eq!(d.ingredients.len(), 2);
    assert!(d.steps.is_empty());
    assert_eq!((d.total_minutes, d.prep_minutes), (Some(25), None));
    assert_eq!(d.warnings.len(), 2);
}

#[tokio::test]
async fn found_false_is_no_recipe_found() {
    let mock = MockAnthropic::start(vec![tool_reply(
        json!({ "found": false, "title": "", "ingredients": [], "steps": [] }),
    )])
    .await;
    let err = provider(&mock).recipe_from_text("hello").await.unwrap_err();
    let AppError::NoRecipeFound(msg) = &err else {
        panic!("{err:?}")
    };
    assert_eq!(msg, "We couldn't find a recipe in that.");
    assert_eq!(err.status_and_code().0.as_u16(), 422);
}

#[tokio::test]
async fn config_debug_hides_the_key_and_ai_enum_follows_config() {
    let mut config = Config {
        database_url: String::new(),
        media_dir: std::env::temp_dir(),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "anthropic".into(),
        anthropic_api_key: Some(Secret::new(KEY)),
        ai_model: "m".into(),
        max_upload_mb: 2,
    };
    let shown = format!("{config:?}");
    assert!(
        !shown.contains(KEY) && shown.contains("[redacted]"),
        "{shown}"
    );
    assert!(matches!(
        Ai::from_config(&config).unwrap(),
        Ai::Anthropic(_)
    ));
    config.ai_provider = "none".into();
    let none = Ai::from_config(&config).unwrap();
    assert!(matches!(
        none.recipe_from_text("x").await,
        Err(AppError::AiDisabled)
    ));
}
