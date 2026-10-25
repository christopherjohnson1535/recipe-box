//! Backup export and import (ACC-5). The archive format is a port ([`ports::BackupFormat`]); this is the workflow.

use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::PathBuf,
    sync::Arc,
};

use domain::{
    BackupLimits, BackupRecipe, DomainError, DomainResult, Recipe, RecipeInput, SearchQuery, Sort,
    chrono::{DateTime, Utc},
    uuid::Uuid,
    validate,
};
use ports::{BackupFormat, BackupWriter, Clock, MediaStore, RecipeRepo};

use crate::{Deps, MediaService, media::original_name};

/// The household's recipes are fetched this many at a time.
const PAGE: i64 = 200;

/// What an import did. Nothing was imported when the import failed; this is only returned on success.
#[derive(Debug, Default)]
pub struct ImportReport {
    pub imported: usize,
    /// Recipes left out because a live recipe with the same id exists (or the archive holds the id twice).
    pub skipped: usize,
    /// Stored photos whose display rendition could not be written (id, why); the caller logs them.
    pub rendition_errors: Vec<(Uuid, DomainError)>,
}

/// Backup export and import.
#[derive(Clone)]
pub struct ExportService {
    recipes: Arc<dyn RecipeRepo>,
    media_store: Arc<dyn MediaStore>,
    media: MediaService,
    backup: Arc<dyn BackupFormat>,
    clock: Arc<dyn Clock>,
    max_photo_bytes: u64,
}

impl ExportService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            recipes: d.recipes.clone(),
            media_store: d.media.clone(),
            media: MediaService::new(d),
            backup: d.backup.clone(),
            clock: d.clock.clone(),
            max_photo_bytes: d.max_upload_bytes as u64,
        }
    }

    /// Starts an export of every live recipe (the household has one recipe box). Pull the archive out of the job
    /// chunk by chunk with [`ExportJob::next_chunk`].
    pub async fn export(&self) -> DomainResult<ExportJob> {
        let mut recipes = Vec::new();
        let mut seen = HashSet::new();
        let mut offset = 0;
        loop {
            let page = self
                .recipes
                .search(SearchQuery {
                    sort: Sort::Newest,
                    limit: PAGE,
                    offset,
                    ..Default::default()
                })
                .await?;
            if page.items.is_empty() {
                break;
            }
            offset += page.items.len() as i64;
            for item in page.items {
                // A recipe deleted since the page was read is gone; one seen twice (the list moved) counts once.
                if seen.insert(item.id)
                    && let Some(r) = self.recipes.get(item.id).await?
                {
                    recipes.push(backup_recipe(r));
                }
            }
            if offset >= page.total {
                break;
            }
        }
        let mut queue = VecDeque::new();
        let mut queued = HashSet::new();
        for id in recipes
            .iter()
            .flat_map(|r| r.input.image_id.iter().chain(&r.input.photo_image_ids))
        {
            if queued.insert(*id) {
                queue.push_back(*id);
            }
        }
        Ok(ExportJob {
            writer: self.backup.writer(),
            media: self.media_store.clone(),
            now: self.clock.now(),
            recipes,
            queue,
            present: HashSet::new(),
            missing: Vec::new(),
            finishing: false,
            done: false,
        })
    }

    /// Imports the archive file at `path`.
    ///
    /// Everything is checked before anything is written: the archive's structure and limits, then every recipe
    /// (the same rules as saving one) and, as each photo is stored, that it is a readable image (the same rules as
    /// an upload). If any of that fails, or saving fails, nothing is kept: the photos stored so far are deleted and
    /// the recipes already saved are deleted again (a soft delete, which the nightly purge finishes), and the error
    /// is returned. Ids in the archive are never trusted: every recipe and photo gets a new id and belongs to
    /// `user_id`. A recipe whose archive id is already a live recipe is skipped (so importing an export back into
    /// the box it came from changes nothing). `Validation` for a bad archive, `UnsupportedMedia` for a bad photo.
    pub async fn import_backup(&self, user_id: Uuid, path: PathBuf) -> DomainResult<ImportReport> {
        let reader = self
            .backup
            .open(path, BackupLimits::new(self.max_photo_bytes))
            .await?;
        let mut report = ImportReport::default();
        let mut todo: Vec<(RecipeInput, Vec<Uuid>)> = Vec::new();
        let mut seen = HashSet::new();
        for BackupRecipe { id, input } in reader.recipes().await? {
            if !seen.insert(id) || self.recipes.get(id).await?.is_some() {
                report.skipped += 1;
                continue;
            }
            let title: String = input.title.chars().take(60).collect();
            let input = validate::recipe(input).map_err(|e| match e {
                DomainError::Validation(m) => {
                    DomainError::validation(format!("recipe \"{title}\": {m}"))
                }
                other => other,
            })?;
            let mut refs: Vec<Uuid> = input
                .image_id
                .into_iter()
                .chain(input.photo_image_ids.iter().copied())
                .collect();
            refs.dedup();
            todo.push((input, refs));
        }

        // Store every photo first; a bad one fails the import before a recipe exists.
        let mut new_ids: HashMap<Uuid, Uuid> = HashMap::new();
        let mut stored: Vec<Uuid> = Vec::new();
        let photos = self
            .store_photos(
                &*reader,
                user_id,
                &todo,
                &mut new_ids,
                &mut stored,
                &mut report,
            )
            .await;
        if let Err(e) = photos {
            self.media.delete_images(&stored).await;
            return Err(e);
        }

        let mut created: Vec<Uuid> = Vec::new();
        for (mut input, _) in todo {
            let map = |old: Uuid| new_ids[&old];
            input.image_id = input.image_id.map(map);
            input.photo_image_ids = input.photo_image_ids.into_iter().map(map).collect();
            match self.recipes.create(user_id, input).await {
                Ok(r) => created.push(r.id),
                Err(e) => {
                    for id in created {
                        let _ = self.recipes.soft_delete(id).await;
                    }
                    self.media.delete_images(&stored).await;
                    return Err(e);
                }
            }
        }
        report.imported = created.len();
        Ok(report)
    }

    async fn store_photos(
        &self,
        reader: &dyn ports::BackupReader,
        user_id: Uuid,
        todo: &[(RecipeInput, Vec<Uuid>)],
        new_ids: &mut HashMap<Uuid, Uuid>,
        stored: &mut Vec<Uuid>,
        report: &mut ImportReport,
    ) -> DomainResult<()> {
        for old in todo.iter().flat_map(|(_, refs)| refs) {
            if new_ids.contains_key(old) {
                continue;
            }
            let bytes = reader.photo(*old).await?.ok_or_else(|| {
                DomainError::validation("The archive is missing a photo a recipe refers to.")
            })?;
            let mut s = self
                .media
                .upload(user_id, bytes)
                .await
                .map_err(|e| match e {
                    DomainError::UnsupportedMedia(m) => {
                        DomainError::UnsupportedMedia(format!("photo {old}: {m}"))
                    }
                    other => other,
                })?;
            stored.push(s.image.id);
            if let Some(e) = s.rendition_error.take() {
                report.rendition_errors.push((s.image.id, e));
            }
            new_ids.insert(*old, s.image.id);
        }
        Ok(())
    }
}

fn backup_recipe(r: Recipe) -> BackupRecipe {
    BackupRecipe {
        id: r.id,
        input: RecipeInput {
            title: r.title,
            description: r.description,
            ingredients: r.ingredients,
            steps: r.steps,
            servings: r.servings,
            prep_minutes: r.prep_minutes,
            cook_minutes: r.cook_minutes,
            total_minutes: r.total_minutes,
            notes: r.notes,
            source_url: r.source_url,
            source_name: r.source_name,
            source_type: r.source_type,
            image_id: r.image_id,
            photo_image_ids: r.photo_image_ids,
            tags: r.tags,
        },
    }
}

/// An export in progress: the archive, one chunk at a time. Photos are read from the media store one by one, so
/// memory use stays at the recipes' text plus one photo. A client that goes away just drops the job.
pub struct ExportJob {
    writer: Box<dyn BackupWriter>,
    media: Arc<dyn MediaStore>,
    now: DateTime<Utc>,
    recipes: Vec<BackupRecipe>,
    queue: VecDeque<Uuid>,
    present: HashSet<Uuid>,
    missing: Vec<Uuid>,
    /// The last chunk has been made.
    finishing: bool,
    done: bool,
}

impl ExportJob {
    /// The next bytes of the archive, or `None` at its end. After an error the job is over (the next call gives
    /// `None`): the archive already sent is incomplete and the caller must abort the response.
    pub async fn next_chunk(&mut self) -> DomainResult<Option<Vec<u8>>> {
        if self.done {
            return Ok(None);
        }
        let r = self.step().await;
        if self.finishing || !matches!(r, Ok(Some(_))) {
            self.done = true;
        }
        r
    }

    /// When the export was started.
    pub fn exported_at(&self) -> DateTime<Utc> {
        self.now
    }

    /// Photos listed by recipes whose file is gone from the media store; the archive leaves them out (and the
    /// recipes' references to them). Complete once the job has ended; the caller logs it.
    pub fn missing_photos(&self) -> &[Uuid] {
        &self.missing
    }

    async fn step(&mut self) -> DomainResult<Option<Vec<u8>>> {
        while let Some(id) = self.queue.pop_front() {
            match self.media.get(&original_name(id)).await? {
                Some(bytes) => {
                    self.present.insert(id);
                    return self.writer.photo(id, &bytes).map(Some);
                }
                None => self.missing.push(id),
            }
        }
        // The manifest goes last so that it only names photos that made it in.
        for r in &mut self.recipes {
            let keep = |id: &Uuid| self.present.contains(id);
            r.input.image_id = r.input.image_id.filter(keep);
            r.input.photo_image_ids.retain(keep);
        }
        // The manifest closes the archive: this is the last chunk.
        self.finishing = true;
        self.writer.finish(self.now, &self.recipes).map(Some)
    }
}
