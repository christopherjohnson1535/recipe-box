use axum::{Json, extract::State, http::StatusCode};
use serde_json::{Value, json};

use crate::state::AppState;

pub async fn health(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let version = env!("CARGO_PKG_VERSION");
    match sqlx::query("select 1").execute(&state.pool).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "ok", "db": "ok", "version": version })),
        ),
        Err(e) => {
            tracing::warn!(error = %e, "health: database check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "error", "db": "error", "version": version })),
            )
        }
    }
}
