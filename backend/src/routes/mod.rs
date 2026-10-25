//! The server's routes: everything the HTTP adapter has, built from the services this state wires.

use adapter_http::{HttpConfig, HttpState};
use axum::Router;

use crate::state::AppState;

pub mod openapi;

pub fn router(state: AppState) -> Router {
    let http = HttpState {
        trusted_proxies: state.trusted_proxies.clone(),
        services: state.services().into(),
        config: HttpConfig {
            cookie_secure: state.config.cookie_secure,
            max_upload_bytes: state.config.max_upload_bytes(),
            max_backup_bytes: state.config.max_backup_bytes(),
            version: env!("CARGO_PKG_VERSION"),
        },
    };
    adapter_http::finish(adapter_http::routes(&http.config), http)
}
