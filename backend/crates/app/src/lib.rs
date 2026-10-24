//! Application services: every rule that is neither a data shape (`domain`) nor a transport (HTTP) nor a storage
//! detail (adapters). Each service holds `Arc<dyn Port>`s and is cheap to clone; methods return
//! [`domain::DomainResult`]. Nothing here logs or reads the wall clock: results that used to be logged are
//! returned, and time comes from the [`ports::Clock`].
//!
//! Build the lot with [`Services::new`] from a [`Deps`].

mod auth;
mod maintenance;
mod media;
mod recipes;
mod users;

use std::sync::Arc;

use ports::{
    Clock, ImageCodec, ImageRepo, MediaStore, PasswordHasher, RecipeRepo, SessionRepo,
    SessionTokens, SettingsRepo, StorageHealth, TagRepo, UserRepo,
};

pub use auth::{AuthService, NewSession};
pub use maintenance::{BackfillReport, Maintenance, PurgeReport};
pub use media::{MediaService, Stored};
pub use recipes::{RecipeService, SettingsService, TagService};
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
    pub health: Arc<dyn StorageHealth>,
    pub media: Arc<dyn MediaStore>,
    pub hasher: Arc<dyn PasswordHasher>,
    pub tokens: Arc<dyn SessionTokens>,
    pub codec: Arc<dyn ImageCodec>,
    pub clock: Arc<dyn Clock>,
    /// How long a new session lasts.
    pub session_days: i64,
}

/// Backup export and import (ACC-5): not built yet, both answer `NotImplemented`.
#[derive(Clone, Default)]
pub struct ExportService;

impl ExportService {
    pub fn export(&self) -> domain::DomainResult<()> {
        Err(domain::DomainError::NotImplemented(
            "Export is not built yet.".into(),
        ))
    }

    pub fn import_backup(&self) -> domain::DomainResult<()> {
        Err(domain::DomainError::NotImplemented(
            "Importing an export is not built yet.".into(),
        ))
    }
}

/// All services, ready to share (every field is cheap to clone).
#[derive(Clone)]
pub struct Services {
    pub recipes: RecipeService,
    pub users: UserService,
    pub auth: AuthService,
    pub settings: SettingsService,
    pub tags: TagService,
    pub media: MediaService,
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
            media: MediaService::new(&d),
            export: ExportService,
            maintenance: Maintenance::new(&d),
        }
    }
}
