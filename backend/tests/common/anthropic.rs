//! A local stand-in for `POST /v1/messages` on 127.0.0.1 (no real network). It records every request and answers
//! from a queue of canned replies, one per request, in order. An empty queue answers 418 so the test fails loudly.
//!
//! ```ignore
//! let mock = MockAnthropic::start(vec![error_reply(529), tool_reply(json!({...}))]).await;
//! let provider = AnthropicProvider::with_base_url(Secret::new("k"), "m".into(), &mock.base_url)?
//!     .with_retry_delay_cap(Duration::ZERO);
//! // ... mock.requests() -> Vec<Recorded { headers, body }>
//! ```

use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
};

use axum::{
    Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct Canned {
    pub status: u16,
    pub body: Value,
    pub headers: Vec<(String, String)>,
    /// Pause before answering (tests use it to trip a short client timeout).
    pub delay: std::time::Duration,
}

impl Canned {
    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    pub fn with_delay(mut self, delay: std::time::Duration) -> Self {
        self.delay = delay;
        self
    }

    pub fn with_stop_reason(mut self, reason: &str) -> Self {
        self.body["stop_reason"] = reason.into();
        self
    }

    pub fn with_error_type(mut self, error_type: &str) -> Self {
        self.body["error"]["type"] = error_type.into();
        self
    }
}

/// A 200 reply whose only content is a `tool_use` block named `record_recipe` with `input`.
pub fn tool_reply(input: Value) -> Canned {
    named_tool_reply("record_recipe", input)
}

/// A 200 reply whose only content is a `tool_use` block named `tool` with `input`.
pub fn named_tool_reply(tool: &str, input: Value) -> Canned {
    Canned {
        status: 200,
        body: json!({
            "id": "msg_test", "type": "message", "role": "assistant", "model": "test", "stop_reason": "tool_use",
            "content": [{ "type": "tool_use", "id": "toolu_test", "name": tool, "input": input }],
        }),
        headers: vec![("request-id".into(), "req_test".into())],
        delay: Default::default(),
    }
}

/// An Anthropic-shaped error reply (`{"type":"error","error":{"type":..,"message":..}}`).
pub fn error_reply(status: u16) -> Canned {
    Canned {
        status,
        body: json!({ "type": "error", "error": { "type": "test_error", "message": "mock failure" } }),
        headers: vec![("request-id".into(), "req_test".into())],
        delay: Default::default(),
    }
}

/// A plausible recipe input for `tool_reply`.
pub fn pancakes() -> Value {
    json!({
        "found": true, "title": "Pancakes", "description": "Fluffy.",
        "ingredients": [{ "text": "1 cup flour", "section": null }, { "text": "1 egg", "section": null }],
        "steps": [{ "text": "Mix.", "section": null }, { "text": "Fry.", "section": null }],
        "servings": "4", "prepMinutes": 5, "cookMinutes": 10, "totalMinutes": 15,
        "notes": "", "tags": ["breakfast"], "warnings": [],
    })
}

#[derive(Clone)]
pub struct Recorded {
    /// Header names lower-cased.
    pub headers: HashMap<String, String>,
    pub body: Value,
}

#[derive(Default)]
struct Inner {
    queue: VecDeque<Canned>,
    seen: Vec<Recorded>,
}

#[derive(Clone)]
pub struct MockAnthropic {
    /// `http://127.0.0.1:<port>`: pass to `AnthropicProvider::with_base_url`.
    pub base_url: String,
    inner: Arc<Mutex<Inner>>,
}

impl MockAnthropic {
    pub async fn start(replies: Vec<Canned>) -> Self {
        let inner = Arc::new(Mutex::new(Inner {
            queue: replies.into(),
            seen: vec![],
        }));
        let app = Router::new()
            .route("/v1/messages", post(handle))
            .with_state(inner.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { base_url, inner }
    }

    pub fn push(&self, reply: Canned) {
        self.inner.lock().unwrap().queue.push_back(reply);
    }

    /// Everything received so far, oldest first.
    pub fn requests(&self) -> Vec<Recorded> {
        self.inner.lock().unwrap().seen.clone()
    }
}

async fn handle(
    State(inner): State<Arc<Mutex<Inner>>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let c = {
        let mut inner = inner.lock().unwrap();
        inner.seen.push(Recorded {
            headers: headers
                .iter()
                .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                .collect(),
            body: serde_json::from_slice(&body).unwrap_or(Value::Null),
        });
        inner.queue.pop_front()
    };
    let Some(c) = c else {
        return (StatusCode::IM_A_TEAPOT, "mock queue empty").into_response();
    };
    tokio::time::sleep(c.delay).await;
    let mut res = (StatusCode::from_u16(c.status).unwrap(), axum::Json(c.body)).into_response();
    for (k, v) in c.headers {
        res.headers_mut().insert(
            HeaderName::try_from(k).unwrap(),
            HeaderValue::from_str(&v).unwrap(),
        );
    }
    res
}

impl MockAnthropic {
    /// Points `state` at this mock: the Anthropic provider, and a config that says AI is on.
    pub fn enable_ai(&self, state: &mut recipe_box_api::state::AppState) {
        use recipe_box_api::{
            config::Secret,
            import::ai::{Ai, AnthropicProvider},
        };
        let p = AnthropicProvider::with_base_url(Secret::new("k"), "m".into(), &self.base_url)
            .unwrap()
            .with_retry_delay_cap(std::time::Duration::ZERO);
        state.ai = Arc::new(Ai::Anthropic(p));
        state.config = Arc::new(recipe_box_api::config::Config {
            ai_provider: "anthropic".into(),
            ..(*state.config).clone()
        });
    }

    /// The prompt text of the `n`th request (the pasted or page text is inside it).
    pub fn prompt(&self, n: usize) -> String {
        self.requests()[n].body["messages"][0]["content"][0]["text"]
            .as_str()
            .unwrap()
            .to_string()
    }
}
