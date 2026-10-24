//! The OpenAPI spec (`docs/openapi.json`): the adapter's paths plus the import paths, which live here.
//! `cargo run --bin openapi > docs/openapi.json` rewrites it; a test and CI fail when it is stale.

use utoipa::OpenApi;

use super::imports;

/// The paths of the routes this crate adds to the adapter's.
#[derive(OpenApi)]
#[openapi(paths(
    imports::capabilities,
    imports::from_url,
    imports::from_text,
    imports::from_photo,
))]
struct ImportDoc;

pub fn json() -> String {
    adapter_http::openapi::json(ImportDoc::openapi(), env!("CARGO_PKG_VERSION"))
}
