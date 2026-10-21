//! Recipe Box API: library crate so integration tests can build the router against a test database.

pub mod auth;
pub mod config;
pub mod error;
pub mod import;
pub mod models;
pub mod routes;
pub mod state;
pub mod validate;

use std::time::Duration;

use sqlx::PgPool;

pub use routes::router;

/// Runs the embedded migrations in `backend/migrations`.
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

/// Hard-deletes recipes soft-deleted more than a day ago and expired sessions.
pub async fn purge(pool: &PgPool) -> Result<(), sqlx::Error> {
    // shortcut: image files of purged recipes stay on disk, add an orphan-image sweep if storage matters.
    let recipes = sqlx::query("delete from recipes where deleted_at < now() - interval '1 day'")
        .execute(pool)
        .await?
        .rows_affected();
    let sessions = sqlx::query("delete from sessions where expires_at < now()")
        .execute(pool)
        .await?
        .rows_affected();
    tracing::info!(recipes, sessions, "purge done");
    Ok(())
}

/// Runs [`purge`] now and then every hour.
pub fn spawn_purge_task(pool: PgPool) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            if let Err(e) = purge(&pool).await {
                tracing::error!(error = %e, "purge failed");
            }
        }
    });
}
