//! The OpenAPI spec (`docs/openapi.json`) is the HTTP adapter's; this only gives it the server's version.
//! `cargo run --bin openapi > docs/openapi.json` rewrites it; a test and CI fail when it is stale.

pub fn json() -> String {
    adapter_http::openapi::json(env!("CARGO_PKG_VERSION"))
}
