//! Application services: every rule that is neither a data shape (`domain`) nor a transport (HTTP) nor a storage
//! detail (adapters). Each service holds `Arc<dyn Port>`s and is cheap to clone; methods return
//! [`domain::DomainResult`]. Nothing here logs or reads the wall clock: results that used to be logged are
//! returned, and time comes from the [`ports::Clock`].
//!
//! Build the lot with [`Services::new`] from a [`Deps`].

mod auth;
mod export;
mod grocery;
mod imports;
mod maintenance;
mod media;
mod recipes;
mod throttle;
mod users;

use std::sync::Arc;

use ports::{
    BackupFormat, Clock, GroceryRepo, ImageCodec, ImageRepo, MediaStore, PageFetcher, PageReader,
    PasswordHasher, RecipeExtractor, RecipeRepo, SessionRepo, SessionTokens, SettingsRepo,
    StorageHealth, TagRepo, TaskSpawner, UserRepo,
};

pub use auth::{AuthService, NewSession};
pub use export::{ExportJob, ExportService, ImportReport};
pub use grocery::{GroceryItemView, GroceryListView, GroceryRecipeView, GroceryService, ItemPatch};
pub use imports::{
    Capabilities, ImportNotes, ImportService, Imported, NoneExtractor, PhotoFailure,
};
pub use maintenance::{BackfillReport, Maintenance, PurgeReport};
pub use media::{MediaService, Stored};
pub use recipes::{RecipeService, SettingsService, TagService};
pub use throttle::{Attempt, Scope, Throttle};
pub use users::UserService;

/// Every port the services need, plus the one setting that is not stored (`SESSION_DAYS`).
#[derive(Clone)]
pub struct Deps {
    pub recipes: Arc<dyn RecipeRepo>,
    pub images: Arc<dyn ImageRepo>,
    pub users: Arc<dyn UserRepo>,
    pub sessions: Arc<dyn SessionRepo>,
    pub settings: Arc<dyn SettingsRepo>,
    pub tags: Arc<dyn TagRepo>,
    pub grocery: Arc<dyn GroceryRepo>,
    pub health: Arc<dyn StorageHealth>,
    pub media: Arc<dyn MediaStore>,
    pub backup: Arc<dyn BackupFormat>,
    pub hasher: Arc<dyn PasswordHasher>,
    pub tokens: Arc<dyn SessionTokens>,
    pub codec: Arc<dyn ImageCodec>,
    pub clock: Arc<dyn Clock>,
    pub extractor: Arc<dyn RecipeExtractor>,
    pub fetcher: Arc<dyn PageFetcher>,
    pub reader: Arc<dyn PageReader>,
    /// Runs cleanup that must outlive a dropped request.
    pub spawner: Arc<dyn TaskSpawner>,
    /// Largest accepted upload (`MAX_UPLOAD_MB`); also caps a page photo downloaded by link import.
    pub max_upload_bytes: usize,
    /// How long a new session lasts.
    pub session_days: i64,
    /// Counts wrong passwords. One per process: build it once and clone the `Arc` into every `Deps`.
    pub throttle: Arc<Throttle>,
}

/// All services, ready to share (every field is cheap to clone).
#[derive(Clone)]
pub struct Services {
    pub recipes: RecipeService,
    pub users: UserService,
    pub auth: AuthService,
    pub settings: SettingsService,
    pub tags: TagService,
    pub grocery: GroceryService,
    pub media: MediaService,
    pub imports: ImportService,
    pub export: ExportService,
    pub maintenance: Maintenance,
}

impl Services {
    pub fn new(d: Deps) -> Self {
        let auth = AuthService::new(&d);
        Self {
            recipes: RecipeService::new(&d),
            users: UserService::new(&d, auth.clone()),
            auth,
            settings: SettingsService::new(&d),
            tags: TagService::new(&d),
            grocery: GroceryService::new(&d),
            media: MediaService::new(&d),
            imports: ImportService::new(&d),
            export: ExportService::new(&d),
            maintenance: Maintenance::new(&d),
        }
    }
}
