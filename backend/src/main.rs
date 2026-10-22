use std::time::Duration;

use recipe_box_api::{config::Config, state::AppState};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        // One line, no backtrace (anyhow's Debug output would print one).
        eprintln!("{}", recipe_box_api::startup_error_line(&e));
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env()?;
    tokio::fs::create_dir_all(&config.media_dir).await?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&config.database_url)
        .await
        .map_err(|e| anyhow::anyhow!("can't reach the database: {}", db_reason(&e)))?;
    recipe_box_api::migrate(&pool).await?;
    recipe_box_api::spawn_purge_task(pool.clone(), recipe_box_api::clock::Clock::System);

    let bind_addr = config.bind_addr.clone();
    let mut state = AppState::new(pool, config)?;
    if let Ok(host) = std::env::var("IMPORT_ALLOW_HOST") {
        state.fetch_policy = state
            .fetch_policy
            .with_allowed_host(&host)
            .map_err(anyhow::Error::msg)?;
        if !host.trim().is_empty() {
            tracing::warn!(%host, "IMPORT_ALLOW_HOST is set: link import may fetch this non-public host (test stacks only)");
        }
    }
    let app = recipe_box_api::router(state);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| anyhow::anyhow!("can't listen on {bind_addr}: {}", io_reason(&e)))?;
    tracing::info!(%bind_addr, "listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Lower-cased io error text without the "(os error N)" suffix.
fn io_reason(e: &std::io::Error) -> String {
    let t = e.to_string();
    let t = t.split(" (os error").next().unwrap_or(&t);
    t.to_lowercase()
}

/// The database error without the URL (it holds the password).
fn db_reason(e: &sqlx::Error) -> String {
    match e {
        sqlx::Error::PoolTimedOut => "timed out waiting for a connection".into(),
        sqlx::Error::Configuration(_) => "DATABASE_URL is not valid".into(),
        sqlx::Error::Io(e) => io_reason(e),
        sqlx::Error::Database(d) => d.message().to_string(),
        _ => "connection failed".into(),
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
    tracing::info!("shutting down");
}
