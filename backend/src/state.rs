use std::{sync::Arc, time::Duration};

use adapter_postgres::{
    PgImageRepo, PgPool, PgRecipeRepo, PgSessionRepo, PgSettingsRepo, PgStorageHealth, PgTagRepo,
    PgUserRepo,
};
use ports::{ImageRepo, RecipeRepo, SessionRepo, SettingsRepo, StorageHealth, TagRepo, UserRepo};

use crate::{
    clock::Clock,
    config::Config,
    import::{ai::Ai, safe_fetch::FetchPolicy},
};

#[derive(Clone)]
pub struct AppState {
    pub recipes: Arc<dyn RecipeRepo>,
    pub images: Arc<dyn ImageRepo>,
    pub users: Arc<dyn UserRepo>,
    pub sessions: Arc<dyn SessionRepo>,
    pub settings: Arc<dyn SettingsRepo>,
    pub tags: Arc<dyn TagRepo>,
    pub health: Arc<dyn StorageHealth>,
    pub config: Arc<Config>,
    /// Outbound client. Redirects are off: `import::safe_fetch` must follow them itself, re-checking each hop.
    pub http: reqwest::Client,
    /// Which addresses link import may fetch. Public only; tests may widen it for their local server.
    pub fetch_policy: FetchPolicy,
    /// "Now" for every time rule. `Clock::System` in production; tests use a fixed one. The repositories hold
    /// the same clock (build the state with [`AppState::with_clock`] to change it).
    pub clock: Clock,
    /// Photo/text recipe extraction. `Ai::None` when `AI_PROVIDER=none`; tests swap in a mock-backed one.
    pub ai: Arc<Ai>,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> anyhow::Result<Self> {
        Self::with_clock(pool, config, Clock::System)
    }

    /// Like [`AppState::new`] with the given clock driving the repositories and every time rule.
    pub fn with_clock(pool: PgPool, config: Config, clock: Clock) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("RecipeBox/", env!("CARGO_PKG_VERSION")))
            .build()?;
        let ai = Arc::new(Ai::from_config(&config)?);
        let port_clock: Arc<dyn ports::Clock> = Arc::new(clock.clone());
        Ok(Self {
            recipes: Arc::new(PgRecipeRepo::new(pool.clone(), port_clock.clone())),
            images: Arc::new(PgImageRepo::new(pool.clone(), port_clock.clone())),
            users: Arc::new(PgUserRepo::new(pool.clone(), port_clock.clone())),
            sessions: Arc::new(PgSessionRepo::new(pool.clone(), port_clock.clone())),
            settings: Arc::new(PgSettingsRepo::new(pool.clone(), port_clock)),
            tags: Arc::new(PgTagRepo::new(pool.clone())),
            health: Arc::new(PgStorageHealth::new(pool)),
            config: Arc::new(config),
            http,
            fetch_policy: FetchPolicy::default(),
            clock,
            ai,
        })
    }
}
