use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRef},
    routing::{delete, get, patch, post, put},
};
use tower_http::trace::TraceLayer;

use crate::{HttpConfig, HttpState, error::AppError};

pub mod auth;
pub mod export;
pub mod grocery;
pub mod health;
pub mod imports;
pub mod integrations;
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
        .layer(DefaultBodyLimit::max(config.max_upload_bytes));
    // A backup holds many photos, so it has its own, larger limit; it is spooled to disk, never held in memory.
    let backups = Router::new()
        .route("/api/import/export", post(export::import_zip))
        .layer(DefaultBodyLimit::max(config.max_backup_bytes + (64 << 10)));
    // Photo import takes up to MAX_PHOTOS files (each still checked against the 1x limit) plus multipart framing.
    let photos = Router::new()
        .route("/api/import/photo", post(imports::from_photo))
        .layer(DefaultBodyLimit::max(
            domain::MAX_PHOTOS * config.max_upload_bytes + (64 << 10),
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
        .route("/api/settings", get(settings::get).put(settings::update))
        .route("/api/grocery", get(grocery::get).delete(grocery::clear))
        .route("/api/grocery/recipes", post(grocery::add_recipe))
        .route(
            "/api/grocery/recipes/{recipeId}",
            delete(grocery::remove_recipe),
        )
        .route("/api/grocery/items", post(grocery::add_item))
        .route(
            "/api/grocery/items/{id}",
            patch(grocery::update_item).delete(grocery::remove_item),
        )
        .route("/api/grocery/clear-checked", post(grocery::clear_checked))
        .route(
            "/api/grocery/export/google-tasks",
            post(grocery::export_google_tasks),
        )
        .route(
            "/api/integrations/google",
            get(integrations::status).delete(integrations::disconnect),
        )
        .route(
            "/api/integrations/google/connect",
            get(integrations::connect),
        )
        .route(
            "/api/integrations/google/callback",
            get(integrations::callback),
        )
        .route("/api/tags", get(tags::list))
        .route("/media/{file_name}", get(media::serve))
        .route("/api/export", get(export::export_zip))
        .route("/api/import/capabilities", get(imports::capabilities))
        .route("/api/import/url", post(imports::from_url))
        .route("/api/import/text", post(imports::from_text))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/{id}", delete(users::remove))
        .route("/api/users/{id}/password", put(users::set_password))
        .layer(DefaultBodyLimit::max(JSON_BODY_LIMIT))
        .merge(uploads)
        .merge(backups)
        .merge(photos)
}

/// The fallbacks and request tracing for the whole router, then its state.
pub fn finish<S>(router: Router<S>, state: S) -> Router
where
    S: Clone + Send + Sync + 'static,
{
    router
        .method_not_allowed_fallback(|| async { AppError::MethodNotAllowed })
        .fallback(|| async { AppError::NotFound("No such endpoint.".into()) })
        // The span carries the path, not the address: a query string can hold a secret (the Google callback's `code`).
        .layer(
            TraceLayer::new_for_http().make_span_with(|req: &axum::http::Request<_>| {
                tracing::debug_span!("request", method = %req.method(), path = %req.uri().path())
            }),
        )
        .with_state(state)
}
