//! The HTTP adapter (docs/adr/0008): axum routes, extractors, error mapping and the API types (`dto`).
//!
//! A handler parses its input, makes one call on an `app` service and maps the result. Rules live in `app`; this
//! crate only owns what is HTTP: cookies, body limits, multipart reading and status codes.
//!
//! The server builds a [`HttpState`], takes [`routes`] (plus any routes of its own, with their own body limits),
//! and finishes the router with [`finish`].

use std::sync::Arc;

use app::Services;

pub mod dto;
pub mod error;
pub mod extract;
pub mod routes;

pub use routes::{finish, openapi, routes};

/// What the handlers need beyond the services.
#[derive(Debug, Clone, Copy)]
pub struct HttpConfig {
    /// `Secure` flag of the session cookie.
    pub cookie_secure: bool,
    /// Max-Age of the session cookie, in days.
    pub session_days: i64,
    /// Largest accepted upload (`MAX_UPLOAD_MB`).
    pub max_upload_bytes: usize,
    /// Reported by `/api/health` and in the OpenAPI spec.
    pub version: &'static str,
}

/// The state of every route of this crate. Cheap to clone.
#[derive(Clone)]
pub struct HttpState {
    pub services: Arc<Services>,
    pub config: HttpConfig,
}
