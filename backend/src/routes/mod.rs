use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{delete, get, post, put},
};
use tower_http::trace::TraceLayer;

use crate::{error::AppError, state::AppState};

pub mod auth;
pub mod export;
pub mod health;
pub mod imports;
pub mod media;
pub mod openapi;
pub mod recipes;
pub mod setup;
pub mod tags;
pub mod users;

/// Body limit for JSON routes (1 MB); see docs/API.md.
pub const JSON_BODY_LIMIT: usize = 1 << 20;

pub fn router(state: AppState) -> Router {
    let upload_limit = state.config.max_upload_bytes();
    // Multipart routes get the large `MAX_UPLOAD_MB` limit; everything else is JSON and stays small.
    let uploads = Router::new()
        .route("/api/media", post(media::upload))
        .route("/api/import/export", post(export::import_zip))
        .layer(DefaultBodyLimit::max(upload_limit));
    // Photo import takes up to MAX_PHOTOS files (each still checked against the 1x limit) plus multipart framing.
    let photos = Router::new()
        .route("/api/import/photo", post(imports::from_photo))
        .layer(DefaultBodyLimit::max(
            imports::MAX_PHOTOS * upload_limit + (64 << 10),
        ));
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
        .route("/api/tags", get(tags::list))
        .route("/media/{file_name}", get(media::serve))
        .route("/api/import/capabilities", get(imports::capabilities))
        .route("/api/import/url", post(imports::from_url))
        .route("/api/import/text", post(imports::from_text))
        .route("/api/export", get(export::export_zip))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/{id}", delete(users::remove))
        .route("/api/users/{id}/password", put(users::set_password))
        .layer(DefaultBodyLimit::max(JSON_BODY_LIMIT))
        .merge(uploads)
        .merge(photos)
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .fallback(|| async { AppError::NotFound("No such endpoint.".into()) })
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub(crate) fn not_implemented(what: &str) -> AppError {
    AppError::NotImplemented(format!("{what} is not built yet."))
}
