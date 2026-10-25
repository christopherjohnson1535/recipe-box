use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use utoipa::ToSchema;

use crate::HttpState;

#[derive(Serialize, ToSchema)]
pub struct Health {
    status: &'static str,
    db: &'static str,
    version: &'static str,
}

/// Liveness plus a database check.
#[utoipa::path(get, path = "/api/health", operation_id = "healthCheck", tag = "health", security(()), responses(
    (status = 200, description = "API and database are up.", body = Health),
    (status = 503, description = "The database check failed (`db` is `error`).", body = Health),
))]
pub async fn health(State(state): State<HttpState>) -> (StatusCode, Json<Health>) {
    let version = state.config.version;
    match state.services.maintenance.ping().await {
        Ok(_) => (
            StatusCode::OK,
            Json(Health {
                status: "ok",
                db: "ok",
                version,
            }),
        ),
        Err(e) => {
            tracing::warn!(error = %e, "health: database check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(Health {
                    status: "error",
                    db: "error",
                    version,
                }),
            )
        }
    }
}
