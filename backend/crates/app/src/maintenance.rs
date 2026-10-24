use std::sync::Arc;

use domain::{DomainError, DomainResult, PURGE_AFTER, uuid::Uuid};
use ports::{Clock, ImageCodec, ImageRepo, MediaStore, RecipeRepo, SessionRepo, StorageHealth};

use crate::{
    Deps,
    media::{display_name, original_name},
};

/// What a purge removed. The server logs it.
#[derive(Debug, PartialEq, Eq)]
pub struct PurgeReport {
    pub recipes: u64,
    pub sessions: u64,
}

/// What a display backfill did. The server logs `skipped` (each is tried again on the next start).
#[derive(Debug)]
pub struct BackfillReport {
    pub made: u64,
    pub skipped: Vec<(Uuid, DomainError)>,
}

/// Housekeeping and the health probe.
#[derive(Clone)]
pub struct Maintenance {
    recipes: Arc<dyn RecipeRepo>,
    sessions: Arc<dyn SessionRepo>,
    images: Arc<dyn ImageRepo>,
    media: Arc<dyn MediaStore>,
    codec: Arc<dyn ImageCodec>,
    health: Arc<dyn StorageHealth>,
    clock: Arc<dyn Clock>,
}

impl Maintenance {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            recipes: d.recipes.clone(),
            sessions: d.sessions.clone(),
            images: d.images.clone(),
            media: d.media.clone(),
            codec: d.codec.clone(),
            health: d.health.clone(),
            clock: d.clock.clone(),
        }
    }

    /// Hard-deletes recipes soft-deleted more than [`PURGE_AFTER`] ago and expired sessions.
    // shortcut: image files of purged recipes stay on disk, add an orphan-image sweep if storage matters.
    pub async fn purge(&self) -> DomainResult<PurgeReport> {
        let recipes = self
            .recipes
            .purge_deleted_before(self.clock.now() - PURGE_AFTER)
            .await?;
        let sessions = self.sessions.purge_expired().await?;
        Ok(PurgeReport { recipes, sessions })
    }

    /// Makes and stores the rendition of one image whose original is stored, if it has none yet. `false` when the
    /// image row is gone (or was rendered meanwhile) and the file just written was removed again.
    pub async fn render_display(&self, id: Uuid) -> DomainResult<bool> {
        let original =
            self.media.get(&original_name(id)).await?.ok_or_else(|| {
                DomainError::Internal(format!("read original of {id}: not found"))
            })?;
        let bytes = self.codec.render_display(id, original).await?;
        let name = display_name(id);
        self.media.put(&name, bytes).await?;
        if self.images.set_display_file(id, &name).await? {
            return Ok(true);
        }
        // The row was deleted meanwhile, or already has another rendition: the file just written is an orphan.
        let _ = self.media.delete(&name).await;
        Ok(false)
    }

    /// Gives every image without a rendition one, one at a time. An image that cannot be read is skipped and
    /// reported. `Err` only when the images cannot be listed. Safe to run on every start.
    pub async fn backfill_displays(&self) -> DomainResult<BackfillReport> {
        let mut report = BackfillReport {
            made: 0,
            skipped: Vec::new(),
        };
        for id in self.images.without_display_file().await? {
            match self.render_display(id).await {
                Ok(true) => report.made += 1,
                Ok(false) => {}
                Err(e) => report.skipped.push((id, e)),
            }
        }
        Ok(report)
    }

    /// Succeeds when the storage answers. The server logs a failure.
    pub async fn ping(&self) -> DomainResult<()> {
        self.health.ping().await
    }
}
