//! The server's routes: everything the HTTP adapter has, plus link, text and photo import (until #92 puts them
//! behind ports). The import routes use the adapter's extractors and error type, and the same body limits as before.

use adapter_http::{HttpConfig, HttpState};
use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRef},
    routing::{get, post},
};

use crate::state::AppState;

pub mod imports;
pub mod openapi;

/// The state of the import routes: the server's wiring set, and what the adapter's extractors need.
#[derive(Clone)]
pub struct ImportState {
    pub app: AppState,
    pub http: HttpState,
}

impl FromRef<ImportState> for HttpState {
    fn from_ref(s: &ImportState) -> Self {
        s.http.clone()
    }
}

pub fn router(state: AppState) -> Router {
    let upload_limit = state.config.max_upload_bytes();
    let http = HttpState {
        services: state.services().into(),
        config: HttpConfig {
            cookie_secure: state.config.cookie_secure,
            max_upload_bytes: upload_limit,
            version: env!("CARGO_PKG_VERSION"),
        },
    };
    let json = Router::new()
        .route("/api/import/capabilities", get(imports::capabilities))
        .route("/api/import/url", post(imports::from_url))
        .route("/api/import/text", post(imports::from_text))
        .layer(DefaultBodyLimit::max(adapter_http::routes::JSON_BODY_LIMIT));
    // Photo import takes up to MAX_PHOTOS files (each still checked against the 1x limit) plus multipart framing.
    let photos = Router::new()
        .route("/api/import/photo", post(imports::from_photo))
        .layer(DefaultBodyLimit::max(
            imports::MAX_PHOTOS * upload_limit + (64 << 10),
        ));
    let routes = adapter_http::routes(&http.config).merge(json).merge(photos);
    adapter_http::finish(routes, ImportState { app: state, http })
}
