use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRef},
    routing::{delete, get, post, put},
};
use tower_http::trace::TraceLayer;

use crate::{HttpConfig, HttpState, error::AppError};

pub mod auth;
pub mod export;
pub mod health;
pub mod media;
pub mod openapi;
pub mod recipes;
pub mod settings;
pub mod setup;
pub mod tags;
pub mod users;

/// Body limit for JSON routes (1 MB); see docs/API.md.
pub const JSON_BODY_LIMIT: usize = 1 << 20;

/// Every route of this crate, each under its body limit (uploads: `config.max_upload_bytes`). Add more routes with `.merge` (under their own limits),
/// then call [`finish`].
pub fn routes<S>(config: &HttpConfig) -> Router<S>
where
    HttpState: FromRef<S>,
    S: Clone + Send + Sync + 'static,
{
    // Multipart routes get the large `MAX_UPLOAD_MB` limit; everything else is JSON and stays small.
    let uploads = Router::new()
        .route("/api/media", post(media::upload))
        .route("/api/import/export", post(export::import_zip))
        .layer(DefaultBodyLimit::max(config.max_upload_bytes));
    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/setup", get(setup::status).post(setup::create_admin))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        .route("/api/recipes", get(recipes::list).post(recipes::create))
        .route(
            "/api/recipes/{id}",
            get(recipes::get)
                .put(recipes::update)
                .delete(recipes::remove),
        )
        .route("/api/recipes/{id}/restore", post(recipes::restore))
        .route("/api/settings", get(settings::get).put(settings::update))
        .route("/api/tags", get(tags::list))
        .route("/media/{file_name}", get(media::serve))
        .route("/api/export", get(export::export_zip))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/{id}", delete(users::remove))
        .route("/api/users/{id}/password", put(users::set_password))
        .layer(DefaultBodyLimit::max(JSON_BODY_LIMIT))
        .merge(uploads)
}

/// The fallbacks and request tracing for the whole router, then its state.
pub fn finish<S>(router: Router<S>, state: S) -> Router
where
    S: Clone + Send + Sync + 'static,
{
    router
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .fallback(|| async { AppError::NotFound("No such endpoint.".into()) })
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
