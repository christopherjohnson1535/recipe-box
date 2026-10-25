//! Recipe import: link, text and photo to a draft, and what the UI may offer. Nothing is saved here except the
//! photos an import stores; the draft is the caller's to review.

use std::{sync::Arc, time::Instant};

use async_trait::async_trait;
use domain::{
    AiProvider, DomainError, DomainResult, Image, MAX_PHOTOS, MAX_TEXT_INPUT_CHARS, MIN_PAGE_CHARS,
    PAGE_MAX_BYTES, PhotoMode, RecipeDraft, SourceType,
    source::{cleaned, normalize_url, shown_url},
    url::Url,
    uuid::Uuid,
    validate,
};
use ports::{PageContent, PageFetcher, PageReader, RecipeExtractor, RecipeRepo, TaskSpawner};

use crate::{Deps, MediaService, Stored};

/// What the server can do, so the UI can hide AI features.
pub struct Capabilities {
    pub ai: bool,
    pub provider: AiProvider,
}

/// What the caller has to log, since this crate does not.
#[derive(Debug, Default)]
pub struct ImportNotes {
    /// Stored photos whose display rendition could not be written (id, why).
    pub rendition_errors: Vec<(Uuid, DomainError)>,
    /// A page photo that was not attached (its address, why). The draft carries a warning.
    pub skipped_image: Option<(String, DomainError)>,
    /// Photos of a failed import that could not be deleted again.
    pub cleanup_failed: bool,
}

impl ImportNotes {
    fn rendition(&mut self, stored: &mut Stored) {
        if let Some(e) = stored.rendition_error.take() {
            self.rendition_errors.push((stored.image.id, e));
        }
    }
}

/// A draft, the images the import stored for it, and what to log. `draft.image_id` and `photo_image_ids` are set;
/// the caller fills `image_url` from the image it finds in `images`.
pub struct Imported {
    pub draft: RecipeDraft,
    pub images: Vec<Image>,
    pub notes: ImportNotes,
}

/// A photo import that made no draft.
#[derive(Debug)]
pub struct PhotoFailure {
    pub error: DomainError,
    /// The stored photos, when they were kept so the form can show them next to an empty recipe (PHO-5).
    /// `None`: nothing is stored.
    pub kept: Option<Vec<Uuid>>,
    pub notes: ImportNotes,
}

/// Link, text and photo import.
#[derive(Clone)]
pub struct ImportService {
    extractor: Arc<dyn RecipeExtractor>,
    fetcher: Arc<dyn PageFetcher>,
    reader: Arc<dyn PageReader>,
    spawner: Arc<dyn TaskSpawner>,
    recipes: Arc<dyn RecipeRepo>,
    media: MediaService,
    max_upload_bytes: usize,
}

impl ImportService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            extractor: d.extractor.clone(),
            fetcher: d.fetcher.clone(),
            reader: d.reader.clone(),
            spawner: d.spawner.clone(),
            recipes: d.recipes.clone(),
            media: MediaService::new(d),
            max_upload_bytes: d.max_upload_bytes,
        }
    }

    pub fn capabilities(&self) -> Capabilities {
        let provider = self.extractor.provider();
        Capabilities {
            ai: provider != AiProvider::None,
            provider,
        }
    }

    /// Reads a recipe from a web page (LNK-1/2/5/7). A page with no recipe data goes to the AI as plain text when
    /// AI is on (LNK-3). `Validation` for an address that is not http(s); the fetch errors as the fetcher gives them.
    pub async fn from_url(&self, user_id: Uuid, url: &str) -> DomainResult<Imported> {
        // The shared helper names `sourceUrl`; this endpoint's field is `url`, so use our own message.
        let requested = validate::source_url(Some(url))
            .ok()
            .flatten()
            .and_then(|u| Url::parse(&u).ok())
            .ok_or_else(|| {
                DomainError::validation(
                    "url: enter a full web address starting with http:// or https://.",
                )
            })?;
        // A monotonic timer for the page budget, not a time rule: nothing here reads the wall clock.
        let started = Instant::now();
        let page = self.fetcher.fetch(&requested, PAGE_MAX_BYTES).await?;
        // Parsing is CPU-bound and runs off the async workers inside what is left of the page's time budget.
        let left = self.fetcher.budget().saturating_sub(started.elapsed());
        let final_url = page.final_url.clone();
        let ai_on = self.extractor.provider() != AiProvider::None;
        let content = self.reader.read(page, ai_on, left).await?;
        let no_recipe = || {
            DomainError::NoRecipeFound(
                "We couldn't find a recipe on that page. You can paste the recipe text instead."
                    .into(),
            )
        };
        let mut draft = match content {
            PageContent::Draft(d) => *d,
            PageContent::Nothing => return Err(no_recipe()),
            PageContent::Text {
                text,
                image_url,
                site_name,
            } => {
                // Too little text to hold a recipe: not worth an AI call.
                if text.chars().filter(|c| !c.is_whitespace()).count() < MIN_PAGE_CHARS {
                    return Err(no_recipe());
                }
                // Outside the page budget: the AI call has its own timeout.
                let mut d = match self.extractor.extract_text(&text).await {
                    Err(DomainError::NoRecipeFound(_)) => return Err(no_recipe()),
                    r => r?,
                };
                d.source_type = SourceType::Link;
                d.source_url = Some(shown_url(&final_url));
                d.source_name = site_name;
                d.image_url = image_url;
                d.warnings
                    .push("Read from the page text by AI — check it against the page.".into());
                d
            }
        };
        draft.duplicate_of = self.duplicate_of(&[&requested, &final_url]).await?;
        let (mut images, mut notes) = (Vec::new(), ImportNotes::default());
        self.attach_image(user_id, &mut draft, &mut images, &mut notes)
            .await;
        Ok(Imported {
            draft,
            images,
            notes,
        })
    }

    /// Reads a recipe from pasted text with AI (LNK-3/4). Never fetches `source_url`.
    pub async fn from_text(
        &self,
        text: &str,
        source_url: Option<&str>,
    ) -> DomainResult<RecipeDraft> {
        if text.trim().is_empty() {
            return Err(DomainError::validation("text: paste the recipe text."));
        }
        // Cleaned first so credentials cannot hide a duplicate.
        let source = validate::source_url(source_url)?
            .and_then(|u| Url::parse(&u).ok())
            .map(|u| cleaned(&u));
        let mut draft = self.extractor.extract_text(text).await?;
        if text.chars().count() > MAX_TEXT_INPUT_CHARS {
            draft.warnings.push(format!(
                "The text was very long, so only the first {} characters were read.",
                MAX_TEXT_INPUT_CHARS
            ));
        }
        if let Some(url) = source {
            draft.source_url = Some(url.to_string());
            draft.duplicate_of = self.duplicate_of(&[&url]).await?;
        }
        Ok(draft)
    }

    /// Reads a recipe from photos (PHO-2–5): stores each (re-encoded) and sends them to the AI. The photos are
    /// kept when the AI cannot make a draft of them (`AiDisabled`, `NoRecipeFound`, `Ai`) and deleted again on any
    /// other failure, including when the caller drops this future (a client that disconnects). `Validation` for
    /// no photos or more than [`MAX_PHOTOS`]; nothing is stored then.
    pub async fn from_photos(
        &self,
        user_id: Uuid,
        files: Vec<Vec<u8>>,
        mode: PhotoMode,
    ) -> Result<Imported, PhotoFailure> {
        let too_few_or_many = match files.len() {
            0 => Some("files: send 1 to 6 photos."),
            n if n > MAX_PHOTOS => Some("files: send at most 6 photos."),
            _ => None,
        };
        if let Some(message) = too_few_or_many {
            return Err(PhotoFailure {
                error: DomainError::validation(message),
                kept: None,
                notes: ImportNotes::default(),
            });
        }
        let (mut images, mut jpegs, mut notes) = (Vec::new(), Vec::new(), ImportNotes::default());
        let mut stored = StoredGuard::new(&self.media, &self.spawner);
        for data in files {
            match self.media.upload(user_id, data).await {
                Ok(mut s) => {
                    notes.rendition(&mut s);
                    stored.ids.push(s.image.id);
                    images.push(s.image);
                    jpegs.push(s.jpeg);
                }
                Err(error) => {
                    notes.cleanup_failed = !stored.delete().await;
                    return Err(PhotoFailure {
                        error,
                        kept: None,
                        notes,
                    });
                }
            }
        }
        let ids: Vec<Uuid> = images.iter().map(|i| i.id).collect();
        match self.extractor.extract_images(&jpegs, mode).await {
            Ok(mut draft) => {
                stored.keep();
                draft.photo_image_ids = ids;
                if mode == PhotoMode::Dish {
                    draft.image_id = Some(images[0].id);
                }
                Ok(Imported {
                    draft,
                    images,
                    notes,
                })
            }
            // No draft, but the photos are kept so the form can show them next to an empty recipe (PHO-5).
            Err(
                error @ (DomainError::AiDisabled
                | DomainError::NoRecipeFound(_)
                | DomainError::Ai(_)),
            ) => {
                stored.keep();
                Err(PhotoFailure {
                    error,
                    kept: Some(ids),
                    notes,
                })
            }
            Err(error) => {
                notes.cleanup_failed = !stored.delete().await;
                Err(PhotoFailure {
                    error,
                    kept: None,
                    notes,
                })
            }
        }
    }

    /// Id of a live recipe saved from the same page (LNK-5), comparing normalised URLs.
    async fn duplicate_of(&self, urls: &[&Url]) -> DomainResult<Option<Uuid>> {
        // Credentials and fragments never count: the saved `source_url` has none.
        let urls: Vec<Url> = urls.iter().map(|u| cleaned(u)).collect();
        let wanted: Vec<String> = urls.iter().map(normalize_url).collect();
        let hosts: Vec<String> = urls
            .iter()
            .filter_map(|u| u.host_str())
            .map(str::to_string)
            .collect();
        // shortcut: normalises in Rust over every live recipe from the same host (prefiltered by the repository);
        // store a normalised column with an index if one host ever has thousands of recipes.
        let rows = self.recipes.live_source_urls(&hosts).await?;
        Ok(rows
            .into_iter()
            .find(|(_, saved)| Url::parse(saved).is_ok_and(|u| wanted.contains(&normalize_url(&u))))
            .map(|(id, _)| id))
    }

    /// Downloads the page's main photo through the fetcher (the SSRF guard) and stores it (re-encoded). A failure
    /// only adds a warning: the recipe is still worth reviewing.
    async fn attach_image(
        &self,
        user_id: Uuid,
        draft: &mut RecipeDraft,
        images: &mut Vec<Image>,
        notes: &mut ImportNotes,
    ) {
        let Some(remote) = draft.image_url.take() else {
            return;
        };
        let stored = async {
            let url = Url::parse(&remote).map_err(|_| DomainError::BlockedAddress)?;
            let img = self.fetcher.fetch(&url, self.max_upload_bytes).await?;
            self.media.upload(user_id, img.body).await
        }
        .await;
        match stored {
            Ok(mut s) => {
                notes.rendition(&mut s);
                draft.image_id = Some(s.image.id);
                images.push(s.image);
            }
            Err(e) => {
                notes.skipped_image = Some((remote, e));
                draft.warnings.push(
                    "The recipe photo could not be downloaded; add one yourself if you like."
                        .into(),
                );
            }
        }
    }
}

/// Ids of the photos stored by this request. Unless [`keep`](Self::keep)t, they are deleted when the guard drops,
/// so a client that disconnects mid-request (the future is dropped) leaves no orphan images.
struct StoredGuard {
    media: MediaService,
    spawner: Arc<dyn TaskSpawner>,
    ids: Vec<Uuid>,
    armed: bool,
}

impl StoredGuard {
    fn new(media: &MediaService, spawner: &Arc<dyn TaskSpawner>) -> Self {
        Self {
            media: media.clone(),
            spawner: spawner.clone(),
            ids: Vec::new(),
            armed: true,
        }
    }

    fn keep(&mut self) {
        self.armed = false;
    }

    /// Deletes the photos now (so the caller's response comes after they are gone); `false` when the rows could
    /// not be deleted.
    async fn delete(mut self) -> bool {
        self.armed = false;
        self.media.delete_images(&self.ids).await
    }
}

impl Drop for StoredGuard {
    fn drop(&mut self) {
        if self.armed && !self.ids.is_empty() {
            let (media, ids) = (self.media.clone(), std::mem::take(&mut self.ids));
            // Nobody is left to see the result, so the spawner logs a failure. A rendition warning for these photos
            // is not logged: they are gone, and every completed path logs its own.
            self.spawner.spawn(
                "could not delete images of a failed request",
                Box::pin(async move {
                    match media.delete_images(&ids).await {
                        true => Ok(()),
                        false => Err(DomainError::Internal(
                            "the image rows could not be deleted".into(),
                        )),
                    }
                }),
            );
        }
    }
}

/// The extractor when `AI_PROVIDER=none`: every call is `AiDisabled`.
#[derive(Clone, Copy, Debug, Default)]
pub struct NoneExtractor;

#[async_trait]
impl RecipeExtractor for NoneExtractor {
    fn provider(&self) -> AiProvider {
        AiProvider::None
    }

    async fn extract_images(&self, _: &[Vec<u8>], _: PhotoMode) -> DomainResult<RecipeDraft> {
        Err(DomainError::AiDisabled)
    }

    async fn extract_text(&self, _: &str) -> DomainResult<RecipeDraft> {
        Err(DomainError::AiDisabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stored(rendition_error: Option<DomainError>) -> Stored {
        Stored {
            image: Image {
                id: Uuid::new_v4(),
                file_name: "a.jpg".into(),
                display_file_name: None,
                width: 1,
                height: 1,
                bytes: 1,
                created_by: None,
            },
            jpeg: vec![1],
            rendition_error,
        }
    }

    #[test]
    fn a_rendition_error_moves_into_the_notes_with_the_image_id() {
        let mut notes = ImportNotes::default();
        let mut s = stored(Some(DomainError::Internal("disk full".into())));
        notes.rendition(&mut s);
        assert!(
            s.rendition_error.is_none(),
            "the error is taken, not copied"
        );
        assert!(matches!(
            notes.rendition_errors.as_slice(),
            [(id, DomainError::Internal(m))] if *id == s.image.id && m == "disk full"
        ));
        // Nothing to report: nothing is added.
        notes.rendition(&mut stored(None));
        assert_eq!(notes.rendition_errors.len(), 1);
    }

    #[tokio::test]
    async fn every_call_is_ai_disabled() {
        let x = NoneExtractor;
        assert_eq!(x.provider(), AiProvider::None);
        assert!(matches!(
            x.extract_text("soup").await,
            Err(DomainError::AiDisabled)
        ));
        assert!(matches!(
            x.extract_images(&[], PhotoMode::Dish).await,
            Err(DomainError::AiDisabled)
        ));
    }
}
