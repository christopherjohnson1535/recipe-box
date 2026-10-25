use std::sync::Arc;

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
    SpawnedTask, StorageHealth, TagRepo, TaskSpawner, UserRepo,
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
    fn spawn(&self, what: &'static str, task: SpawnedTask) {
        tokio::spawn(async move {
            if let Err(e) = task.await {
                tracing::warn!(error = %e, "{what}");
            }
        });
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
    /// Proxies whose `X-Forwarded-For` the rate limiter believes (`TRUSTED_PROXIES`). None by default.
    pub trusted_proxies: adapter_http::TrustedProxies,
    /// Wrong-password counts, shared by every `deps()` call.
    pub throttle: Arc<app::Throttle>,
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
            backup: Arc::new(crate::backup::ZipBackup),
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
            throttle: self.throttle.clone(),
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
            trusted_proxies: Default::default(),
            throttle: app::Throttle::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io,
        sync::{Arc, Mutex},
    };

    use domain::DomainError;

    use super::*;

    /// A writer the subscriber logs into and the test reads back.
    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Vec<u8>>>);

    impl io::Write for Captured {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Captured {
        /// What was logged so far (flushing first, as a buffered sink would need).
        fn text(&self) -> String {
            io::Write::flush(&mut self.clone()).unwrap();
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    // The runtime of `#[tokio::test]` is single-threaded, so the spawned task logs on this thread, where the
    // subscriber is set, and has done so by the time the receiver wakes.
    #[tokio::test]
    async fn a_failed_task_is_logged_and_does_not_panic() {
        let log = Captured::default();
        let writer = log.clone();
        let _guard = tracing::subscriber::set_default(
            tracing_subscriber::fmt()
                .with_writer(move || writer.clone())
                .with_ansi(false)
                .finish(),
        );
        let (ran, done) = tokio::sync::oneshot::channel();
        TokioSpawner.spawn(
            "could not delete images of a failed request",
            Box::pin(async move {
                let _ = ran.send(());
                Err(DomainError::Internal("rows stuck".into()))
            }),
        );
        done.await.expect("the task ran");
        let out = log.text();
        assert!(out.contains("WARN"), "{out}");
        assert!(
            out.contains("could not delete images of a failed request"),
            "{out}"
        );
        assert!(out.contains("rows stuck"), "{out}");
    }

    #[tokio::test]
    async fn a_successful_task_runs_and_logs_nothing() {
        let log = Captured::default();
        let writer = log.clone();
        let _guard = tracing::subscriber::set_default(
            tracing_subscriber::fmt()
                .with_writer(move || writer.clone())
                .finish(),
        );
        let (ran, done) = tokio::sync::oneshot::channel();
        TokioSpawner.spawn(
            "never logged",
            Box::pin(async move {
                let _ = ran.send(());
                Ok(())
            }),
        );
        done.await.expect("the task ran");
        tokio::task::yield_now().await;
        assert!(log.text().is_empty());
    }
}
