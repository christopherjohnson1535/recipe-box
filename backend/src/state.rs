use std::{sync::Arc, time::Duration};

use sqlx::PgPool;

use crate::{clock::Clock, config::Config, import::safe_fetch::FetchPolicy};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    /// Outbound client. Redirects are off: `import::safe_fetch` must follow them itself, re-checking each hop.
    pub http: reqwest::Client,
    /// Which addresses link import may fetch. Public only; tests may widen it for their local server.
    pub fetch_policy: FetchPolicy,
    /// "Now" for every time rule. `Clock::System` in production; tests swap in a fixed one.
    pub clock: Clock,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("RecipeBox/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            pool,
            config: Arc::new(config),
            http,
            fetch_policy: FetchPolicy::default(),
            clock: Clock::System,
        })
    }
}
