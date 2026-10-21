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
pub mod recipes;
pub mod setup;
pub mod tags;
pub mod users;

pub fn router(state: AppState) -> Router {
    let body_limit = state.config.max_upload_bytes();
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
        .route("/api/media", post(media::upload))
        .route("/media/{file_name}", get(media::serve))
        .route("/api/import/capabilities", get(imports::capabilities))
        .route("/api/import/url", post(imports::from_url))
        .route("/api/import/text", post(imports::from_text))
        .route("/api/import/photo", post(imports::from_photo))
        .route("/api/import/export", post(export::import_zip))
        .route("/api/export", get(export::export_zip))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/{id}", delete(users::remove))
        .route("/api/users/{id}/password", put(users::set_password))
        .fallback(|| async { AppError::NotFound("No such endpoint.".into()) })
        .layer(DefaultBodyLimit::max(body_limit))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub(crate) fn not_implemented(what: &str) -> AppError {
    AppError::NotImplemented(format!("{what} is not built yet."))
}
