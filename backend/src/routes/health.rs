use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct Health {
    status: &'static str,
    db: &'static str,
    version: &'static str,
}

/// Liveness plus a database check.
#[utoipa::path(get, path = "/api/health", operation_id = "healthCheck", tag = "health", responses(
    (status = 200, description = "API and database are up.", body = Health),
    (status = 503, description = "The database check failed (`db` is `error`).", body = Health),
))]
pub async fn health(State(state): State<AppState>) -> (StatusCode, Json<Health>) {
    let version = env!("CARGO_PKG_VERSION");
    match sqlx::query("select 1").execute(&state.pool).await {
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
