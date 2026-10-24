use std::{future::Future, pin::Pin, sync::Arc};

use adapter_fs_media::FsMediaStore;
use adapter_html::HtmlPageReader;
use adapter_http_fetch::HttpPageFetcher;
use adapter_postgres::{
    PgImageRepo, PgPool, PgRecipeRepo, PgSessionRepo, PgSettingsRepo, PgStorageHealth, PgTagRepo,
    PgUserRepo,
};
use app::{Deps, Services};
use ports::{
    ImageRepo, MediaStore, PageFetcher, RecipeExtractor, RecipeRepo, SessionRepo, SettingsRepo,
    StorageHealth, TagRepo, TaskSpawner, UserRepo,
};

use crate::{
    auth::{password::Argon2Hasher, session::RandomTokens},
    clock::Clock,
    config::Config,
    import::{ai::Ai, safe_fetch::FetchPolicy},
    media::ImageCrateCodec,
};

/// Runs cleanup tasks on the tokio runtime.
struct TokioSpawner;

impl TaskSpawner for TokioSpawner {
    fn spawn(&self, task: Pin<Box<dyn Future<Output = ()> + Send + 'static>>) {
        tokio::spawn(task);
    }
}

#[derive(Clone)]
pub struct AppState {
    pub recipes: Arc<dyn RecipeRepo>,
    pub images: Arc<dyn ImageRepo>,
    pub users: Arc<dyn UserRepo>,
    pub sessions: Arc<dyn SessionRepo>,
    pub settings: Arc<dyn SettingsRepo>,
    pub tags: Arc<dyn TagRepo>,
    pub media: Arc<dyn MediaStore>,
    pub health: Arc<dyn StorageHealth>,
    pub config: Arc<Config>,
    /// Which addresses link import may fetch. Public only; tests may widen it for their local server.
    pub fetch_policy: FetchPolicy,
    /// "Now" for every time rule. `Clock::System` in production; tests use a fixed one. The repositories hold
    /// the same clock (build the state with [`AppState::with_clock`] to change it).
    pub clock: Clock,
    /// Photo/text recipe extraction. `Ai::None` when `AI_PROVIDER=none`; tests swap in a mock-backed one.
    pub ai: Arc<dyn RecipeExtractor>,
}

impl AppState {
    /// The ports the services run on: this state's repositories and clock, config and the server-side adapters.
    /// Built from the state as it is now, so a test that changed `config` after `new` is respected.
    pub fn deps(&self) -> Deps {
        Deps {
            recipes: self.recipes.clone(),
            images: self.images.clone(),
            users: self.users.clone(),
            sessions: self.sessions.clone(),
            settings: self.settings.clone(),
            tags: self.tags.clone(),
            health: self.health.clone(),
            media: self.media.clone(),
            hasher: Arc::new(Argon2Hasher),
            tokens: Arc::new(RandomTokens),
            codec: Arc::new(ImageCrateCodec),
            clock: Arc::new(self.clock.clone()),
            extractor: self.ai.clone(),
            fetcher: self.fetcher(),
            reader: Arc::new(HtmlPageReader),
            spawner: Arc::new(TokioSpawner),
            max_upload_bytes: self.config.max_upload_bytes(),
            session_days: self.config.session_days,
        }
    }

    /// The page fetcher, built from the CURRENT `fetch_policy` (tests change the policy after `new`).
    pub fn fetcher(&self) -> Arc<dyn PageFetcher> {
        Arc::new(HttpPageFetcher::new(self.fetch_policy.clone()))
    }

    pub fn services(&self) -> Services {
        Services::new(self.deps())
    }

    pub fn new(pool: PgPool, config: Config) -> anyhow::Result<Self> {
        Self::with_clock(pool, config, Clock::System)
    }

    /// Like [`AppState::new`] with the given clock driving the repositories and every time rule.
    pub fn with_clock(pool: PgPool, config: Config, clock: Clock) -> anyhow::Result<Self> {
        let ai = Arc::new(Ai::from_config(&config)?);
        let port_clock: Arc<dyn ports::Clock> = Arc::new(clock.clone());
        Ok(Self {
            recipes: Arc::new(PgRecipeRepo::new(pool.clone(), port_clock.clone())),
            images: Arc::new(PgImageRepo::new(pool.clone(), port_clock.clone())),
            users: Arc::new(PgUserRepo::new(pool.clone(), port_clock.clone())),
            sessions: Arc::new(PgSessionRepo::new(pool.clone(), port_clock.clone())),
            settings: Arc::new(PgSettingsRepo::new(pool.clone(), port_clock)),
            tags: Arc::new(PgTagRepo::new(pool.clone())),
            media: Arc::new(FsMediaStore::new(config.media_dir.clone())),
            health: Arc::new(PgStorageHealth::new(pool)),
            config: Arc::new(config),
            fetch_policy: FetchPolicy::default(),
            clock,
            ai,
        })
    }
}
