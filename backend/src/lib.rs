//! Recipe Box API: library crate so integration tests can build the router against a test database.

pub mod auth;
pub mod backup;
pub mod clock;
pub mod config;
pub mod error;
pub mod import;
pub mod media;
pub mod models;
pub mod plate;
pub mod routes;
pub mod state;

use std::time::Duration;

use app::Maintenance;
use state::AppState;

pub use domain::{PURGE_AFTER, validate};
pub use routes::router;

/// The single line printed when startup fails: `recipe-box-api: <message>`.
pub fn startup_error_line(e: &anyhow::Error) -> String {
    format!("recipe-box-api: {e}")
}

/// Hard-deletes recipes soft-deleted more than a day ago and expired sessions.
pub async fn purge(state: &AppState) -> domain::DomainResult<()> {
    let done = state.services().maintenance.purge().await?;
    tracing::info!(
        recipes = done.recipes,
        sessions = done.sessions,
        "purge done"
    );
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

/// Gives every image without a rendition one and logs what happened; returns how many were made. An image that
/// cannot be read is logged and skipped (it is tried again on the next start). Safe to run on every start.
pub async fn backfill_displays(maintenance: &Maintenance) -> u64 {
    let report = match maintenance.backfill_displays().await {
        Ok(report) => report,
        Err(e) => {
            tracing::error!(error = %e, "display backfill: could not list images");
            return 0;
        }
    };
    for (id, e) in &report.skipped {
        tracing::warn!(%id, error = ?e, "display backfill: skipped an image");
    }
    tracing::info!(made = report.made, "display backfill done");
    report.made
}

/// Gives photos stored before renditions existed their rendition, in the background.
pub fn spawn_display_backfill(state: AppState) {
    tokio::spawn(async move {
        backfill_displays(&state.services().maintenance).await;
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
