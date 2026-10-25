//! `ExportService` over the in-memory adapters: what is exported, and what an import keeps, skips or undoes.

use std::{collections::HashMap, path::PathBuf, sync::Arc};

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryBackup, MemoryMedia, MemoryStore,
};
use app::{Deps, Services};
use async_trait::async_trait;
use domain::{
    BackupRecipe, DomainError, DomainResult, Ingredient, Page, Recipe, RecipeInput, RecipeSummary,
    SearchQuery, SourceType,
    chrono::{DateTime, Utc},
    uuid::Uuid,
};
use ports::{ImageRepo, RecipeRepo, contract::ManualClock};

#[allow(dead_code)] // shared with the other test files
mod common;

struct World {
    services: Services,
    store: Arc<MemoryStore>,
    media: Arc<MemoryMedia>,
    backup: Arc<MemoryBackup>,
    user: Uuid,
}

/// A recipe repository that fails its `fail_on`th `create` (1-based) and passes everything else on.
struct FailingCreate {
    inner: Arc<MemoryStore>,
    fail_on: usize,
    calls: std::sync::atomic::AtomicUsize,
}

#[async_trait]
impl RecipeRepo for FailingCreate {
    async fn create(&self, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let n = self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        if n == self.fail_on {
            return Err(DomainError::Internal("disk on fire".into()));
        }
        self.inner.create(user_id, input).await
    }
    async fn get(&self, id: Uuid) -> DomainResult<Option<Recipe>> {
        self.inner.get(id).await
    }
    async fn update(&self, id: Uuid, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        self.inner.update(id, user_id, input).await
    }
    async fn soft_delete(&self, id: Uuid) -> DomainResult<()> {
        self.inner.soft_delete(id).await
    }
    async fn restore(&self, id: Uuid) -> DomainResult<Recipe> {
        self.inner.restore(id).await
    }
    async fn purge_deleted_before(&self, cutoff: DateTime<Utc>) -> DomainResult<u64> {
        self.inner.purge_deleted_before(cutoff).await
    }
    async fn search(&self, query: SearchQuery) -> DomainResult<Page<RecipeSummary>> {
        self.inner.search(query).await
    }
    async fn live_source_urls(&self, hosts: &[String]) -> DomainResult<Vec<(Uuid, String)>> {
        self.inner.live_source_urls(hosts).await
    }
}

impl World {
    fn new() -> Self {
        Self::with(|store| store)
    }

    fn with(recipes: impl FnOnce(Arc<MemoryStore>) -> Arc<dyn RecipeRepo>) -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let media = Arc::new(MemoryMedia::default());
        let backup = Arc::new(MemoryBackup::default());
        let services = Services::new(Deps {
            recipes: recipes(store.clone()),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            health: store.clone(),
            media: media.clone(),
            backup: backup.clone(),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock,
            extractor: Arc::new(app::NoneExtractor),
            fetcher: Arc::new(common::FakeFetcher::default()),
            reader: Arc::new(common::FakeReader::default()),
            spawner: Arc::new(common::CollectingSpawner::default()),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: app::Throttle::new(),
        });
        Self {
            services,
            store,
            media,
            backup,
            user: Uuid::new_v4(),
        }
    }

    /// A real household member (the store only names creators it knows).
    async fn member(&mut self) {
        let u = self
            .services
            .users
            .create("cook", "Cook", "correct horse".into(), "admin")
            .await
            .unwrap();
        self.user = u.id;
    }

    async fn import(&self) -> DomainResult<app::ImportReport> {
        self.services
            .export
            .import_backup(self.user, PathBuf::from("ignored"))
            .await
    }

    async fn live(&self) -> Vec<Recipe> {
        let page = self
            .store
            .search(SearchQuery {
                limit: 200,
                ..Default::default()
            })
            .await
            .unwrap();
        let mut out = Vec::new();
        for r in page.items {
            out.push(self.store.get(r.id).await.unwrap().unwrap());
        }
        out
    }
}

fn input(title: &str) -> RecipeInput {
    RecipeInput {
        title: title.into(),
        ingredients: vec![Ingredient {
            text: "1 egg".into(),
            section: None,
        }],
        source_type: SourceType::Link,
        tags: vec!["dinner".into()],
        ..Default::default()
    }
}

fn archived(id: Uuid, mut i: RecipeInput, photos: &[Uuid]) -> BackupRecipe {
    i.image_id = photos.first().copied();
    i.photo_image_ids = photos.to_vec();
    BackupRecipe { id, input: i }
}

async fn add_image(w: &World, bytes: &[u8]) -> Uuid {
    let s = w
        .services
        .media
        .upload(w.user, bytes.to_vec())
        .await
        .unwrap();
    s.image.id
}

async fn drain(job: &mut app::ExportJob) -> DomainResult<Vec<u8>> {
    let mut all = Vec::new();
    while let Some(chunk) = job.next_chunk().await? {
        all.extend(chunk);
    }
    Ok(all)
}

#[tokio::test]
async fn export_sends_photos_then_the_manifest_of_live_recipes_only() {
    let w = World::new();
    let a = add_image(&w, b"jpeg-a").await;
    let b = add_image(&w, b"jpeg-b").await;
    let mut with_photos = input("Soup");
    with_photos.image_id = Some(a);
    with_photos.photo_image_ids = vec![a, b];
    let soup = w.store.create(w.user, with_photos).await.unwrap();
    let gone = w.store.create(w.user, input("Deleted")).await.unwrap();
    w.store.soft_delete(gone.id).await.unwrap();

    let mut job = w.services.export.export().await.unwrap();
    // Two photos (the first is listed twice by the recipe but sent once), then the manifest.
    assert_eq!(drain(&mut job).await.unwrap(), b"ppr");
    assert!(job.next_chunk().await.unwrap().is_none());
    let written = w.backup.written();
    assert_eq!(
        written.photos,
        vec![(a, b"jpeg-a".to_vec()), (b, b"jpeg-b".to_vec())]
    );
    assert_eq!(written.recipes.len(), 1);
    assert_eq!(written.recipes[0].id, soup.id);
    assert_eq!(written.recipes[0].input.photo_image_ids, vec![a, b]);
}

#[tokio::test]
async fn export_leaves_out_photos_whose_file_is_gone() {
    let w = World::new();
    let a = add_image(&w, b"jpeg-a").await;
    let mut i = input("Soup");
    i.image_id = Some(a);
    i.photo_image_ids = vec![a];
    w.store.create(w.user, i).await.unwrap();
    use ports::MediaStore;
    w.media.delete(&format!("{a}.jpg")).await.unwrap();

    let mut job = w.services.export.export().await.unwrap();
    drain(&mut job).await.unwrap();
    assert_eq!(job.missing_photos(), [a]);
    let written = w.backup.written();
    assert!(written.photos.is_empty());
    assert_eq!(written.recipes[0].input.image_id, None);
    assert!(written.recipes[0].input.photo_image_ids.is_empty());
}

#[tokio::test]
async fn import_gives_everything_new_ids_and_the_importer_as_owner() {
    let mut w = World::new();
    w.member().await;
    let (old_a, old_b, rid) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    w.backup.serve(
        vec![
            archived(rid, input("Soup"), &[old_a, old_b]),
            archived(Uuid::new_v4(), input("Stew"), &[old_a]),
        ],
        HashMap::from([(old_a, b"jpeg-a".to_vec()), (old_b, b"jpeg-b".to_vec())]),
    );
    let report = w.import().await.unwrap();
    assert_eq!((report.imported, report.skipped), (2, 0));

    let recipes = w.live().await;
    assert_eq!(recipes.len(), 2);
    let soup = recipes.iter().find(|r| r.title == "Soup").unwrap();
    assert_ne!(soup.id, rid);
    assert_eq!(soup.created_by.as_ref().map(|u| u.id), Some(w.user));
    assert_eq!(soup.tags, vec!["dinner"]);
    assert_eq!(soup.photo_image_ids.len(), 2);
    assert!(!soup.photo_image_ids.contains(&old_a) && !soup.photo_image_ids.contains(&old_b));
    assert_eq!(soup.image_id, Some(soup.photo_image_ids[0]));
    // A photo two recipes share is stored once: two photos, each with its rendition.
    assert_eq!(w.media.names().len(), 4);
}

#[tokio::test]
async fn import_skips_ids_that_exist_and_repeats_inside_the_archive() {
    let w = World::new();
    let existing = w.store.create(w.user, input("Mine")).await.unwrap();
    let again = Uuid::new_v4();
    w.backup.serve(
        vec![
            archived(existing.id, input("Theirs"), &[]),
            archived(again, input("New"), &[]),
            archived(again, input("New twice"), &[]),
        ],
        HashMap::new(),
    );
    let report = w.import().await.unwrap();
    assert_eq!((report.imported, report.skipped), (1, 2));
    let titles: Vec<String> = w.live().await.into_iter().map(|r| r.title).collect();
    assert!(titles.contains(&"Mine".into()) && titles.contains(&"New".into()));
    assert_eq!(titles.len(), 2);
}

#[tokio::test]
async fn import_applies_the_recipe_rules_and_keeps_nothing_on_failure() {
    let w = World::new();
    let old = Uuid::new_v4();
    w.backup.serve(
        vec![
            archived(Uuid::new_v4(), input("Fine"), &[old]),
            archived(Uuid::new_v4(), input("   "), &[]),
        ],
        HashMap::from([(old, b"jpeg".to_vec())]),
    );
    let err = w.import().await.unwrap_err();
    assert!(matches!(err, DomainError::Validation(m) if m.contains("title")));
    assert!(w.live().await.is_empty());
    assert!(w.media.names().is_empty(), "no photo was stored");

    let mut bad_url = input("Bad link");
    bad_url.source_url = Some("javascript:alert(1)".into());
    w.backup
        .serve(vec![archived(Uuid::new_v4(), bad_url, &[])], HashMap::new());
    assert!(matches!(w.import().await, Err(DomainError::Validation(_))));
}

#[tokio::test]
async fn import_rejects_a_photo_that_is_not_an_image_and_removes_the_others() {
    let w = World::new();
    let (good, bad) = (Uuid::new_v4(), Uuid::new_v4());
    w.backup.serve(
        vec![archived(Uuid::new_v4(), input("Soup"), &[good, bad])],
        // The fake codec refuses empty input like the real one refuses non-images.
        HashMap::from([(good, b"jpeg".to_vec()), (bad, Vec::new())]),
    );
    assert!(matches!(
        w.import().await,
        Err(DomainError::UnsupportedMedia(_))
    ));
    assert!(w.live().await.is_empty());
    assert!(
        w.media.names().is_empty(),
        "the stored photo was deleted again"
    );
}

#[tokio::test]
async fn import_with_a_photo_missing_from_the_archive_fails() {
    let w = World::new();
    w.backup.serve(
        vec![archived(Uuid::new_v4(), input("Soup"), &[Uuid::new_v4()])],
        HashMap::new(),
    );
    assert!(matches!(w.import().await, Err(DomainError::Validation(_))));
    assert!(w.live().await.is_empty());
}

#[tokio::test]
async fn a_failure_while_saving_undoes_the_recipes_and_photos_already_stored() {
    let w = World::with(|store| {
        Arc::new(FailingCreate {
            inner: store,
            fail_on: 2,
            calls: Default::default(),
        })
    });
    let old = Uuid::new_v4();
    w.backup.serve(
        vec![
            archived(Uuid::new_v4(), input("One"), &[old]),
            archived(Uuid::new_v4(), input("Two"), &[]),
        ],
        HashMap::from([(old, b"jpeg".to_vec())]),
    );
    assert!(matches!(w.import().await, Err(DomainError::Internal(_))));
    assert!(w.live().await.is_empty());
    assert!(w.media.names().is_empty());
}

#[tokio::test]
async fn an_archive_that_cannot_be_opened_is_the_readers_error() {
    let w = World::new();
    w.backup.refuse(DomainError::validation("not a zip"));
    assert!(matches!(w.import().await, Err(DomainError::Validation(m)) if m == "not a zip"));
}

#[allow(dead_code)]
fn _images_are_repo_backed(w: &World) -> &dyn ImageRepo {
    &*w.store
}
