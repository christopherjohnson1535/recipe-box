//! `ImportService` over the in-memory adapters and scripted fakes for the fetcher, reader, extractor and spawner.

#[allow(dead_code)] // shared with tests/services.rs
mod common;

use std::sync::Arc;

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryMedia, MemoryStore,
};
use app::{Deps, Services};
use common::{CollectingSpawner, FakeExtractor, FakeFetcher, FakeReader, UndeletableImages, draft};
use domain::{
    AiProvider, DomainError, DomainResult, PhotoMode, RecipeInput, SourceType, uuid::Uuid,
};
use ports::{ImageRepo, PageContent, contract::ManualClock};

const UPLOAD_CAP: usize = 1 << 20;
const PAGE: &str = "https://example.com/soup";

/// Page text with enough characters (300 non-whitespace) to be worth an AI call.
fn long_text() -> String {
    "Boil water. ".repeat(30)
}

struct World {
    services: Services,
    media: Arc<MemoryMedia>,
    fetcher: Arc<FakeFetcher>,
    reader: Arc<FakeReader>,
    extractor: Arc<FakeExtractor>,
    spawner: Arc<CollectingSpawner>,
    user: Uuid,
}

impl World {
    fn new() -> Self {
        Self::with(FakeExtractor::on())
    }

    fn with(extractor: FakeExtractor) -> Self {
        Self::with_images(extractor, |store| store)
    }

    /// Like [`World::with`], with the image repository wrapped by `images`.
    fn with_images(
        extractor: FakeExtractor,
        images: impl FnOnce(Arc<MemoryStore>) -> Arc<dyn ImageRepo>,
    ) -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let media = Arc::new(MemoryMedia::default());
        let fetcher = Arc::new(FakeFetcher::default());
        let reader = Arc::new(FakeReader::default());
        let extractor = Arc::new(extractor);
        let spawner = Arc::new(CollectingSpawner::default());
        let services = Services::new(Deps {
            recipes: store.clone(),
            images: images(store.clone()),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            health: store.clone(),
            media: media.clone(),
            backup: Arc::new(adapter_memory::MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock,
            extractor: extractor.clone(),
            fetcher: fetcher.clone(),
            reader: reader.clone(),
            spawner: spawner.clone(),
            max_upload_bytes: UPLOAD_CAP,
            session_days: 30,
            throttle: app::Throttle::new(),
        });
        Self {
            services,
            media,
            fetcher,
            reader,
            extractor,
            spawner,
            user: Uuid::new_v4(),
        }
    }

    /// The reader finds a recipe on the page at `PAGE`.
    fn page_with_recipe(&self, image_url: Option<&str>) {
        self.fetcher.page(PAGE, PAGE, b"<html>");
        let mut d = draft("Soup");
        d.source_type = SourceType::Link;
        d.source_url = Some(PAGE.into());
        d.image_url = image_url.map(Into::into);
        self.reader.says(Ok(PageContent::Draft(Box::new(d))));
    }
}

fn is_validation<T>(r: DomainResult<T>, msg: &str) -> bool {
    matches!(r, Err(DomainError::Validation(m)) if m == msg)
}

#[tokio::test]
async fn capabilities_come_from_the_extractor() {
    let on = World::new().services.imports.capabilities();
    assert!(on.ai && on.provider == AiProvider::Anthropic);
    let mut none = FakeExtractor::on();
    none.provider = AiProvider::None;
    let off = World::with(none).services.imports.capabilities();
    assert!(!off.ai && off.provider == AiProvider::None);
}

#[tokio::test]
async fn url_with_recipe_data_is_a_draft_without_ai() {
    let w = World::new();
    w.page_with_recipe(None);
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.draft.title, "Soup");
    assert!(got.draft.duplicate_of.is_none() && got.images.is_empty());
    assert!(w.extractor.seen_text.lock().unwrap().is_empty());
    assert_eq!(*w.reader.want_text.lock().unwrap(), [true]);
}

#[tokio::test]
async fn url_must_be_http() {
    let w = World::new();
    let msg = "url: enter a full web address starting with http:// or https://.";
    for bad in ["", "soup", "ftp://example.com/a"] {
        assert!(is_validation(
            w.services.imports.from_url(w.user, bad).await,
            msg
        ));
    }
    assert!(w.fetcher.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn url_without_recipe_data_falls_back_to_ai_text() {
    let w = World::new();
    w.fetcher
        .page(PAGE, "https://example.com/soup?a=1#frag", b"<html>");
    w.reader.says(Ok(PageContent::Text {
        text: long_text(),
        image_url: None,
        site_name: Some("Example".into()),
    }));
    let d = w
        .services
        .imports
        .from_url(w.user, PAGE)
        .await
        .unwrap()
        .draft;
    assert_eq!(d.title, "AI soup");
    assert!(matches!(d.source_type, SourceType::Link));
    assert_eq!(
        d.source_url.as_deref(),
        Some("https://example.com/soup?a=1")
    );
    assert_eq!(d.source_name.as_deref(), Some("Example"));
    assert_eq!(
        d.warnings,
        ["Read from the page text by AI — check it against the page."]
    );
    assert_eq!(*w.extractor.seen_text.lock().unwrap(), [long_text()]);
}

#[tokio::test]
async fn page_text_too_short_for_a_recipe_is_not_sent_to_the_ai() {
    let msg = "We couldn't find a recipe on that page. You can paste the recipe text instead.";
    // 199 non-whitespace characters (spaces do not count) is one short; 200 goes through.
    for (count, sent) in [(199, false), (200, true)] {
        let w = World::new();
        w.fetcher.page(PAGE, PAGE, b"<html>");
        w.reader.says(Ok(PageContent::Text {
            text: "x ".repeat(count),
            image_url: None,
            site_name: None,
        }));
        let r = w.services.imports.from_url(w.user, PAGE).await;
        assert_eq!(
            w.extractor.seen_text.lock().unwrap().len(),
            usize::from(sent)
        );
        match sent {
            true => assert!(r.is_ok()),
            false => assert!(matches!(r, Err(DomainError::NoRecipeFound(m)) if m == msg)),
        }
    }
}

#[tokio::test]
async fn url_with_ai_off_or_no_recipe_in_the_text_is_no_recipe_found() {
    let msg = "We couldn't find a recipe on that page. You can paste the recipe text instead.";
    let mut off = FakeExtractor::on();
    off.provider = AiProvider::None;
    let w = World::with(off);
    w.fetcher.page(PAGE, PAGE, b"<html>");
    let r = w.services.imports.from_url(w.user, PAGE).await;
    assert!(matches!(r, Err(DomainError::NoRecipeFound(m)) if m == msg));
    assert_eq!(*w.reader.want_text.lock().unwrap(), [false]);

    let mut ai = FakeExtractor::on();
    ai.text = Box::new(|| Err(DomainError::NoRecipeFound("the model says no".into())));
    let w = World::with(ai);
    w.fetcher.page(PAGE, PAGE, b"<html>");
    w.reader.says(Ok(PageContent::Text {
        text: long_text(),
        image_url: None,
        site_name: None,
    }));
    let r = w.services.imports.from_url(w.user, PAGE).await;
    assert!(matches!(r, Err(DomainError::NoRecipeFound(m)) if m == msg));
}

#[tokio::test]
async fn fetch_errors_pass_through() {
    let w = World::new();
    let r = w.services.imports.from_url(w.user, PAGE).await;
    assert!(matches!(r, Err(DomainError::FetchFailed(m)) if m == "unreachable"));
}

#[tokio::test]
async fn url_import_flags_a_recipe_already_saved_from_the_same_page() {
    let w = World::new();
    let saved = w
        .services
        .recipes
        .create(
            w.user,
            RecipeInput {
                title: "Mine".into(),
                source_url: Some("https://EXAMPLE.com/soup/?utm_source=mail#top".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    w.page_with_recipe(None);
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.draft.duplicate_of, Some(saved.id));

    let w = World::new();
    w.page_with_recipe(None);
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.draft.duplicate_of, None);
}

#[tokio::test]
async fn url_import_stores_the_page_photo_through_the_fetcher_with_the_upload_cap() {
    let w = World::new();
    w.page_with_recipe(Some("https://cdn.example.com/p.jpg"));
    w.fetcher.page(
        "https://cdn.example.com/p.jpg",
        "https://cdn.example.com/p.jpg",
        b"jpeg",
    );
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.images.len(), 1);
    assert_eq!(got.draft.image_id, Some(got.images[0].id));
    assert_eq!(
        got.draft.image_url, None,
        "the address of a stored file is the adapter's to set"
    );
    assert!(got.notes.skipped_image.is_none() && got.draft.warnings.is_empty());
    assert_eq!(w.media.names().len(), 2, "original and rendition");
    let calls = w.fetcher.calls.lock().unwrap();
    assert_eq!(
        calls[1],
        ("https://cdn.example.com/p.jpg".to_string(), UPLOAD_CAP)
    );
}

#[tokio::test]
async fn a_page_photo_that_cannot_be_stored_only_adds_a_warning() {
    let warning = "The recipe photo could not be downloaded; add one yourself if you like.";
    // Not fetchable.
    let w = World::new();
    w.page_with_recipe(Some("https://cdn.example.com/missing.jpg"));
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.draft.warnings, [warning]);
    let (image, why) = got.notes.skipped_image.unwrap();
    assert_eq!(image, "https://cdn.example.com/missing.jpg");
    assert!(matches!(why, DomainError::FetchFailed(_)));
    assert!(got.draft.image_id.is_none() && got.draft.image_url.is_none());

    // Fetched, but not an image.
    let w = World::new();
    w.page_with_recipe(Some("https://cdn.example.com/p.jpg"));
    w.fetcher.page(
        "https://cdn.example.com/p.jpg",
        "https://cdn.example.com/p.jpg",
        b"",
    );
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert_eq!(got.draft.warnings, [warning]);
    assert!(matches!(
        got.notes.skipped_image,
        Some((_, DomainError::UnsupportedMedia(_)))
    ));
    assert!(w.media.names().is_empty());

    // Not an address.
    let w = World::new();
    w.page_with_recipe(Some("not a url"));
    let got = w.services.imports.from_url(w.user, PAGE).await.unwrap();
    assert!(matches!(
        got.notes.skipped_image,
        Some((_, DomainError::BlockedAddress))
    ));
}

#[tokio::test]
async fn text_import_needs_text_and_warns_when_it_is_long() {
    let w = World::new();
    let i = &w.services.imports;
    assert!(is_validation(
        i.from_text("  \n", None).await,
        "text: paste the recipe text."
    ));
    assert!(w.extractor.seen_text.lock().unwrap().is_empty());

    let d = i.from_text("Boil water.", None).await.unwrap();
    assert_eq!(d.title, "AI soup");
    assert!(d.warnings.is_empty());

    let long = "x".repeat(domain::MAX_TEXT_INPUT_CHARS + 1);
    let d = i.from_text(&long, None).await.unwrap();
    assert_eq!(
        d.warnings,
        ["The text was very long, so only the first 50000 characters were read."]
    );
    let exact = "x".repeat(domain::MAX_TEXT_INPUT_CHARS);
    assert!(i.from_text(&exact, None).await.unwrap().warnings.is_empty());
}

#[tokio::test]
async fn text_import_cleans_the_source_and_flags_duplicates() {
    let w = World::new();
    let saved = w
        .services
        .recipes
        .create(
            w.user,
            RecipeInput {
                title: "Mine".into(),
                source_url: Some(PAGE.into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let i = &w.services.imports;
    let d = i
        .from_text("Boil water.", Some("https://me:pw@example.com/soup/#x"))
        .await
        .unwrap();
    assert_eq!(d.source_url.as_deref(), Some("https://example.com/soup/"));
    assert_eq!(d.duplicate_of, Some(saved.id));
    assert!(
        w.fetcher.calls.lock().unwrap().is_empty(),
        "the source is never fetched"
    );
    assert!(is_validation(
        i.from_text("Boil water.", Some("javascript:alert(1)"))
            .await,
        "sourceUrl: must be an http(s) URL."
    ));
}

#[tokio::test]
async fn text_import_without_ai_is_ai_disabled() {
    let mut off = FakeExtractor::on();
    off.text = Box::new(|| Err(DomainError::AiDisabled));
    let w = World::with(off);
    let r = w.services.imports.from_text("Boil water.", None).await;
    assert!(matches!(r, Err(DomainError::AiDisabled)));
}

fn photos(n: usize) -> Vec<Vec<u8>> {
    (1..=n).map(|i| vec![i as u8; i]).collect()
}

#[tokio::test]
async fn no_photos_or_too_many_are_a_validation_error_and_nothing_is_stored() {
    for (n, message) in [
        (0, "files: send 1 to 6 photos."),
        (7, "files: send at most 6 photos."),
    ] {
        for mode in [PhotoMode::Recipe, PhotoMode::Dish] {
            let w = World::new();
            let f = w
                .services
                .imports
                .from_photos(w.user, photos(n), mode)
                .await
                .err()
                .unwrap();
            assert!(matches!(&f.error, DomainError::Validation(m) if m == message));
            assert!(f.kept.is_none());
            assert!(w.media.names().is_empty());
            assert!(w.extractor.seen_images.lock().unwrap().is_empty());
        }
    }
    // Six is the most.
    let w = World::new();
    assert!(
        w.services
            .imports
            .from_photos(w.user, photos(6), PhotoMode::Recipe)
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn photos_are_stored_and_kept_with_the_draft() {
    let w = World::new();
    let got = w
        .services
        .imports
        .from_photos(w.user, photos(2), PhotoMode::Recipe)
        .await
        .unwrap();
    let ids: Vec<Uuid> = got.images.iter().map(|i| i.id).collect();
    assert_eq!(got.draft.photo_image_ids, ids);
    assert_eq!(got.draft.image_id, None);
    assert_eq!(*w.extractor.seen_images.lock().unwrap(), [2]);
    assert_eq!(w.media.names().len(), 4);
    assert_eq!(w.spawner.spawned(), 0);

    let got = w
        .services
        .imports
        .from_photos(w.user, photos(2), PhotoMode::Dish)
        .await
        .unwrap();
    assert_eq!(
        got.draft.image_id,
        Some(got.images[0].id),
        "dish: the first photo is the recipe's"
    );
}

#[tokio::test]
async fn photos_stay_stored_when_the_ai_cannot_make_a_draft() {
    for make in [
        (|| DomainError::AiDisabled) as fn() -> DomainError,
        || DomainError::NoRecipeFound("none".into()),
        || DomainError::Ai("down".into()),
    ] {
        let mut x = FakeExtractor::on();
        x.images = Box::new(move || Err(make()));
        let w = World::with(x);
        let f = w
            .services
            .imports
            .from_photos(w.user, photos(2), PhotoMode::Recipe)
            .await
            .err()
            .unwrap();
        assert_eq!(f.kept.as_ref().map(Vec::len), Some(2));
        assert_eq!(w.media.names().len(), 4, "the photos are kept (PHO-5)");
        assert_eq!(w.spawner.spawned(), 0);
    }
}

#[tokio::test]
async fn photos_are_deleted_on_any_other_error() {
    let mut x = FakeExtractor::on();
    x.images = Box::new(|| Err(DomainError::Internal("boom".into())));
    let w = World::with(x);
    let f = w
        .services
        .imports
        .from_photos(w.user, photos(2), PhotoMode::Recipe)
        .await
        .err()
        .unwrap();
    assert!(matches!(f.error, DomainError::Internal(_)) && f.kept.is_none());
    assert!(!f.notes.cleanup_failed);
    assert!(w.media.names().is_empty());
    assert_eq!(w.spawner.spawned(), 0, "deleted now, not by the guard");
}

#[tokio::test]
async fn photos_stored_before_a_bad_file_are_deleted() {
    let w = World::new();
    let f = w
        .services
        .imports
        .from_photos(w.user, vec![b"ok".to_vec(), vec![]], PhotoMode::Recipe)
        .await
        .err()
        .unwrap();
    assert!(matches!(f.error, DomainError::UnsupportedMedia(_)) && f.kept.is_none());
    assert!(w.media.names().is_empty());
    assert!(w.extractor.seen_images.lock().unwrap().is_empty());
}

#[tokio::test]
async fn photos_of_a_dropped_request_are_deleted_by_the_spawner() {
    let mut x = FakeExtractor::on();
    x.hang = true;
    let w = World::with(x);
    let import = w
        .services
        .imports
        .from_photos(w.user, photos(2), PhotoMode::Recipe);
    tokio::select! {
        biased;
        _ = import => unreachable!("the AI never answers"),
        _ = async {} => {}
    }
    assert_eq!(w.media.names().len(), 4, "still there until the task runs");
    assert_eq!(w.spawner.spawned(), 1);
    let done = w.spawner.run_all().await;
    assert!(w.media.names().is_empty());
    assert!(matches!(done.as_slice(), [(_, Ok(()))]));
}

#[tokio::test]
async fn a_failed_cleanup_of_a_dropped_request_is_reported_to_the_spawner() {
    let mut x = FakeExtractor::on();
    x.hang = true;
    let w = World::with_images(x, |store| Arc::new(UndeletableImages(store)));
    let import = w
        .services
        .imports
        .from_photos(w.user, photos(2), PhotoMode::Recipe);
    tokio::select! {
        biased;
        _ = import => unreachable!("the AI never answers"),
        _ = async {} => {}
    }
    let done = w.spawner.run_all().await;
    assert!(
        matches!(
            done.as_slice(),
            [("could not delete images of a failed request", Err(_))]
        ),
        "the spawner logs what the task returns"
    );
}
