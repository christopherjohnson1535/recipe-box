//! Recipe Box API: library crate so integration tests can build the router against a test database.

pub mod auth;
pub mod clock;
pub mod config;
pub mod error;
pub mod import;
pub mod models;
pub mod plate;
pub mod routes;
pub mod state;

use std::time::Duration;

use sqlx::PgPool;

use state::AppState;

pub use domain::{PURGE_AFTER, validate};
pub use routes::router;

/// The single line printed when startup fails: `recipe-box-api: <message>`.
pub fn startup_error_line(e: &anyhow::Error) -> String {
    format!("recipe-box-api: {e}")
}

/// Runs the embedded migrations (owned by the Postgres adapter crate).
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    adapter_postgres::migrate(pool).await
}

/// Hard-deletes recipes soft-deleted more than a day ago and expired sessions.
pub async fn purge(state: &AppState) -> domain::DomainResult<()> {
    // shortcut: image files of purged recipes stay on disk, add an orphan-image sweep if storage matters.
    let recipes = state
        .recipes
        .purge_deleted_before(state.clock.now() - PURGE_AFTER)
        .await?;
    let sessions = state.sessions.purge_expired().await?;
    tracing::info!(recipes, sessions, "purge done");
    Ok(())
}

/// Runs [`purge`] now and then every hour.
pub fn spawn_purge_task(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            if let Err(e) = purge(&state).await {
                tracing::error!(error = %e, "purge failed");
            }
        }
    });
}

/// Gives photos stored before renditions existed their rendition, in the background.
pub fn spawn_display_backfill(state: AppState) {
    tokio::spawn(async move {
        routes::media::backfill_displays(state.images.as_ref(), &state.config.media_dir).await;
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn startup_error_is_one_line() {
        let e = anyhow::anyhow!("can't listen on 0.0.0.0:8080: address already in use");
        assert_eq!(
            super::startup_error_line(&e),
            "recipe-box-api: can't listen on 0.0.0.0:8080: address already in use"
        );
    }
}
