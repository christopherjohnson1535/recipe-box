//! The checked-in spec (`docs/openapi.json`) matches the code, and the spec and the router list the same
//! operations. No database is needed: a lazy pool never connects, and every probe stops before a query or at
//! the first failed one.

use std::{collections::BTreeSet, path::Path};

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use recipe_box_api::{config::Config, routes::openapi, state::AppState};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

const SPEC_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../docs/openapi.json");

#[test]
fn checked_in_spec_is_current() {
    let on_disk = std::fs::read_to_string(SPEC_PATH).unwrap_or_default();
    assert!(
        on_disk == openapi::json(),
        "docs/openapi.json is stale: run `cargo run --bin openapi > ../docs/openapi.json` in backend/ \
         (and `npx openapi-typescript ../docs/openapi.json -o src/lib/api-types.ts` in frontend/)"
    );
}

#[test]
fn spec_is_deterministic() {
    assert_eq!(openapi::json(), openapi::json());
}

#[test]
fn every_ref_resolves() {
    fn walk(v: &Value, schemas: &serde_json::Map<String, Value>, missing: &mut Vec<String>) {
        match v {
            Value::Object(m) => {
                if let Some(Value::String(r)) = m.get("$ref") {
                    let name = r.trim_start_matches("#/components/schemas/");
                    if !schemas.contains_key(name) {
                        missing.push(r.clone());
                    }
                }
                m.values().for_each(|c| walk(c, schemas, missing));
            }
            Value::Array(a) => a.iter().for_each(|c| walk(c, schemas, missing)),
            _ => {}
        }
    }
    let spec: Value = serde_json::from_str(&openapi::json()).unwrap();
    let schemas = spec["components"]["schemas"].as_object().unwrap();
    let mut missing = Vec::new();
    walk(&spec, schemas, &mut missing);
    assert!(missing.is_empty(), "dangling $refs: {missing:?}");
}

#[tokio::test]
async fn spec_and_router_list_the_same_operations() {
    let spec: Value = serde_json::from_str(&openapi::json()).unwrap();
    let paths = spec["paths"].as_object().unwrap();

    // Every path the router registers is in the spec.
    let source = [
        "crates/adapters/http/src/routes/mod.rs",
        "src/routes/mod.rs",
    ]
    .map(|f| std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join(f)).unwrap())
    .join("\n");
    let registered: BTreeSet<&str> = source
        .split('"')
        .filter(|s| s.starts_with("/api/") || s.starts_with("/media/"))
        .collect();
    assert!(
        registered.len() >= 15,
        "router paths not found: {registered:?}"
    );
    for path in &registered {
        assert!(
            paths.contains_key(*path),
            "{path} is routed but not in the spec"
        );
    }

    // For every spec path, a method answers 405 exactly when the spec does not list it.
    let config = Config {
        database_url: String::new(),
        media_dir: std::env::temp_dir(),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "none".into(),
        anthropic_api_key: None,
        ai_model: "test".into(),
        max_upload_mb: 2,
    };
    let pool = PgPoolOptions::new()
        .acquire_timeout(std::time::Duration::from_millis(200))
        .connect_lazy("postgres://nobody@127.0.0.1:1/none")
        .unwrap();
    let app = recipe_box_api::router(AppState::new(pool, config).unwrap());
    for (path, item) in paths {
        let uri = path.replace(['{', '}'], "");
        for method in [
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
        ] {
            let documented = item.get(method.as_str().to_lowercase()).is_some();
            let req = Request::builder()
                .method(method.clone())
                .uri(&uri)
                .body(Body::empty())
                .unwrap();
            let status = app.clone().oneshot(req).await.unwrap().status();
            assert_eq!(
                status == StatusCode::METHOD_NOT_ALLOWED,
                !documented,
                "{method} {path}: status {status}, documented in spec: {documented}"
            );
        }
    }
}

#[test]
fn error_code_is_an_extensible_enum() {
    let spec: Value = serde_json::from_str(&openapi::json()).unwrap();
    let schema = &spec["components"]["schemas"]["ErrorCode"];
    assert!(
        schema.get("enum").is_none(),
        "plain enum breaks oasdiff on every new code"
    );
    let codes: Vec<&str> = schema["x-extensible-enum"]
        .as_array()
        .expect("x-extensible-enum")
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    for c in ["validation", "ai_disabled", "ai_error", "internal"] {
        assert!(codes.contains(&c), "missing {c}");
    }
    assert_eq!(codes.len(), 16, "{codes:?}");
}
