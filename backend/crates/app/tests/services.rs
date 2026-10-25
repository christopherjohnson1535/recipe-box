//! One test per rule the services own, over the in-memory adapters and a manual clock.

#[allow(dead_code)] // shared with tests/imports.rs
mod common;

use std::sync::Arc;

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryMedia, MemoryStore,
};
use app::{Deps, NoneExtractor, Services};
use async_trait::async_trait;
use domain::Image;
use domain::{
    DomainError, DomainResult, Recipe, RecipeInput, Settings, User, chrono::Duration, uuid::Uuid,
};
use ports::{Clock, ImageRepo, MediaStore, PasswordHasher, UserRepo, contract::ManualClock};

struct World {
    clock: Arc<ManualClock>,
    store: Arc<MemoryStore>,
    hasher: Arc<FakePasswordHasher>,
    deps: Deps,
}

impl World {
    fn new() -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let media = Arc::new(MemoryMedia::default());
        let hasher = Arc::new(FakePasswordHasher::default());
        let deps = Deps {
            recipes: store.clone(),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            google_connections: store.clone(),
            identities: store.clone(),
            google_signin: Arc::new(app::DisabledGoogleSignIn),
            flows: Arc::new(app::DisabledGoogleSignIn),
            health: store.clone(),
            media,
            backup: Arc::new(adapter_memory::MemoryBackup::default()),
            hasher: hasher.clone(),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock: clock.clone(),
            extractor: Arc::new(NoneExtractor),
            fetcher: Arc::new(common::FakeFetcher::default()),
            reader: Arc::new(common::FakeReader::default()),
            google: Arc::new(app::DisabledGoogleTasks),
            cipher: Arc::new(adapter_memory::FakeTokenCipher),
            spawner: Arc::new(common::CollectingSpawner::default()),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: app::Throttle::new(),
        };
        Self {
            clock,
            store,
            hasher,
            deps,
        }
    }

    fn services(&self) -> Services {
        Services::new(self.deps.clone())
    }
}

const PASSWORD: &str = "correct horse";

async fn user(s: &Services, name: &str, role: &str) -> User {
    s.users
        .create(name, name, PASSWORD.into(), role, None)
        .await
        .unwrap()
}

fn input(title: &str) -> RecipeInput {
    RecipeInput {
        title: title.into(),
        ..Default::default()
    }
}

fn is_validation<T>(r: DomainResult<T>, msg: &str) -> bool {
    matches!(r, Err(DomainError::Validation(m)) if m == msg)
}

fn is_wrong_login<T>(r: DomainResult<T>) -> bool {
    matches!(
        r,
        Err(DomainError::Unauthenticated("Wrong username or password."))
    )
}

#[tokio::test]
async fn search_reports_limit_then_offset_then_sort() {
    let s = World::new().services();
    let search = |sort, limit, offset| s.recipes.search(None, None, sort, limit, offset);
    assert!(is_validation(
        search(Some("bogus"), 0, 0).await,
        "limit: 1–200."
    ));
    assert!(is_validation(
        search(Some("bogus"), 1, -1).await,
        "offset: must be 0 or more."
    ));
    assert!(is_validation(
        search(Some("bogus"), 1, 0).await,
        "sort: newest, title or time."
    ));
    for ok in [None, Some("newest"), Some("title"), Some("time")] {
        assert!(search(ok, 1, 0).await.is_ok(), "{ok:?}");
    }
}

#[tokio::test]
async fn search_checks_limit_then_offset() {
    let s = World::new().services();
    let search = |limit, offset| s.recipes.search(None, None, None, limit, offset);
    assert!(is_validation(search(0, 0).await, "limit: 1–200."));
    assert!(is_validation(search(201, 0).await, "limit: 1–200."));
    assert!(is_validation(search(0, -1).await, "limit: 1–200."));
    assert!(is_validation(
        search(1, -1).await,
        "offset: must be 0 or more."
    ));
    assert!(search(1, 0).await.is_ok() && search(200, 0).await.is_ok());
}

#[tokio::test]
async fn recipes_are_validated_before_saving() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    assert!(matches!(
        s.recipes.create(u.id, input("  ")).await,
        Err(DomainError::Validation(_))
    ));
    let r = s.recipes.create(u.id, input(" Soup ")).await.unwrap();
    assert!(matches!(
        s.recipes.update(r.id, u.id, input("")).await,
        Err(DomainError::Validation(_))
    ));
    assert_eq!(s.recipes.get(r.id).await.unwrap().title, "Soup");
}

#[tokio::test]
async fn unknown_image_id_is_a_validation_error() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let bad = RecipeInput {
        image_id: Some(Uuid::new_v4()),
        ..input("Soup")
    };
    assert!(matches!(
        s.recipes.create(u.id, bad).await,
        Err(DomainError::Validation(_))
    ));
}

#[tokio::test]
async fn plate_rule_hides_the_rendition_everywhere_when_off() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap().image;
    let with_image = || RecipeInput {
        image_id: Some(img.id),
        ..input("Soup")
    };
    let shown = |r: &Recipe| r.image_display_file.is_some();
    let r = s.recipes.create(u.id, with_image()).await.unwrap();
    assert!(shown(&r) && shown(&s.recipes.get(r.id).await.unwrap()));
    let listed = || s.recipes.search(None, None, None, 10, 0);
    assert!(
        listed().await.unwrap().items[0]
            .image_display_file
            .is_some()
    );

    s.settings
        .set(Settings {
            plate_treatment: false,
        })
        .await
        .unwrap();
    assert!(!shown(&s.recipes.get(r.id).await.unwrap()));
    assert!(
        listed().await.unwrap().items[0]
            .image_display_file
            .is_none()
    );
    assert!(!shown(&s.recipes.create(u.id, with_image()).await.unwrap()));
    assert!(!shown(
        &s.recipes.update(r.id, u.id, with_image()).await.unwrap()
    ));
    s.recipes.delete(r.id).await.unwrap();
    assert!(!shown(&s.recipes.restore(r.id).await.unwrap()));
    // The original is untouched.
    assert!(s.recipes.get(r.id).await.unwrap().image_file.is_some());
}

#[tokio::test]
async fn missing_recipe_is_not_found() {
    let s = World::new().services();
    assert!(matches!(
        s.recipes.get(Uuid::new_v4()).await,
        Err(DomainError::NotFound(m)) if m == "Recipe not found."
    ));
}

#[tokio::test]
async fn restore_works_inside_the_window_only() {
    let w = World::new();
    let s = w.services();
    let u = user(&s, "ann", "admin").await;
    let quick = s.recipes.create(u.id, input("Quick")).await.unwrap().id;
    let slow = s.recipes.create(u.id, input("Slow")).await.unwrap().id;
    s.recipes.delete(quick).await.unwrap();
    s.recipes.delete(slow).await.unwrap();
    w.clock.advance(Duration::minutes(9));
    assert!(s.recipes.restore(quick).await.is_ok());
    w.clock.advance(Duration::minutes(1));
    assert!(matches!(
        s.recipes.restore(slow).await,
        Err(DomainError::Conflict(_))
    ));
}

#[tokio::test]
async fn long_password_is_refused_before_any_hashing() {
    let w = World::new();
    let s = w.services();
    user(&s, "ann", "admin").await;
    let long = "x".repeat(1025);
    assert!(is_wrong_login(s.auth.login("ann", long, None).await));
    assert_eq!(w.hasher.verify_count(), 0);
}

#[tokio::test]
async fn unknown_user_and_wrong_password_look_the_same() {
    let w = World::new();
    let s = w.services();
    user(&s, "ann", "admin").await;
    assert!(is_wrong_login(
        s.auth.login("ann", "nope nope nope".into(), None).await
    ));
    assert!(is_wrong_login(
        s.auth.login("bob", PASSWORD.into(), None).await
    ));
    assert_eq!(w.hasher.verify_count(), 2);
    // Only "bob" is unknown: his login still verifies, against no hash (the dummy-work path).
    assert_eq!(w.hasher.verify_without_hash_count(), 1);
    // Case and padding in the username do not matter; the session lasts `session_days`.
    let (u, session) = s.auth.login("  ANN ", PASSWORD.into(), None).await.unwrap();
    assert_eq!(session.expires_at, w.clock.now() + Duration::days(30));
    let found = s.auth.current_user(&session.token).await.unwrap().unwrap();
    assert_eq!(found.id, u.id);
}

#[tokio::test]
async fn logout_ends_only_that_session() {
    let s = World::new().services();
    user(&s, "ann", "admin").await;
    let (_, a) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    let (_, b) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    s.auth.logout(None).await.unwrap();
    s.auth.logout(Some(&a.token)).await.unwrap();
    assert!(s.auth.current_user(&a.token).await.unwrap().is_none());
    assert!(s.auth.current_user(&b.token).await.unwrap().is_some());
}

#[tokio::test]
async fn a_session_is_gone_once_its_lifetime_has_passed() {
    let w = World::new();
    let s = w.services();
    user(&s, "ann", "admin").await;
    let (_, session) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    assert_eq!(session.lifetime, Duration::days(30));
    w.clock.advance(Duration::days(30) - Duration::seconds(1));
    assert!(s.auth.current_user(&session.token).await.unwrap().is_some());
    w.clock.advance(Duration::seconds(2));
    assert!(s.auth.current_user(&session.token).await.unwrap().is_none());
}

#[tokio::test]
async fn setup_works_once() {
    let s = World::new().services();
    assert!(s.users.needs_setup().await.unwrap());
    let (admin, session) = s
        .users
        .create_first_admin("Ann", "Ann", PASSWORD.into())
        .await
        .unwrap();
    assert!(admin.is_admin() && !s.users.needs_setup().await.unwrap());
    assert!(s.auth.current_user(&session.token).await.unwrap().is_some());
    assert!(matches!(
        s.users
            .create_first_admin("bob", "Bob", PASSWORD.into())
            .await,
        Err(DomainError::Forbidden(_))
    ));
}

#[tokio::test]
async fn new_users_are_validated_in_order() {
    async fn create(
        s: &Services,
        name: &str,
        display: &str,
        pw: &str,
        role: &str,
    ) -> DomainResult<User> {
        s.users.create(name, display, pw.into(), role, None).await
    }
    let s = World::new().services();
    assert!(
        matches!(create(&s, "a", "A", "short", "root").await, Err(DomainError::Validation(m)) if m.starts_with("username"))
    );
    assert!(
        matches!(create(&s, "ann", " ", "short", "root").await, Err(DomainError::Validation(m)) if m.starts_with("displayName"))
    );
    assert!(
        matches!(create(&s, "ann", "Ann", "short", "root").await, Err(DomainError::Validation(m)) if m.starts_with("password"))
    );
    assert!(is_validation(
        create(&s, "ann", "Ann", PASSWORD, "root").await,
        "role: `admin` or `member`."
    ));
    assert!(create(&s, "ann", "Ann", PASSWORD, "member").await.is_ok());
    assert!(matches!(
        create(&s, "ANN", "Ann", PASSWORD, "member").await,
        Err(DomainError::Conflict(_))
    ));
}

#[tokio::test]
async fn remove_refuses_yourself_and_the_last_admin() {
    let s = World::new().services();
    let ann = user(&s, "ann", "admin").await;
    let bob = user(&s, "bob", "admin").await;
    let eve = user(&s, "eve", "member").await;
    assert!(matches!(
        s.users.remove(&ann, ann.id).await,
        Err(DomainError::Forbidden(m)) if m == "You can't remove yourself."
    ));
    s.users.remove(&ann, eve.id).await.unwrap();
    s.users.remove(&ann, bob.id).await.unwrap();
    // Ann is now the last admin; another admin would have to remove her, so use a stale caller.
    assert!(matches!(
        s.users.remove(&bob, ann.id).await,
        Err(DomainError::Forbidden(_))
    ));
}

#[tokio::test]
async fn own_password_change_checks_current_and_keeps_only_this_session() {
    let w = World::new();
    let s = w.services();
    let ann = user(&s, "ann", "member").await;
    let (_, here) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    let (_, other) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    let change = |current: Option<&str>| {
        s.users.set_password(
            &ann,
            ann.id,
            "a brand new one".into(),
            current.map(Into::into),
            Some(&here.token),
            None,
        )
    };
    assert!(is_wrong_login(change(None).await));
    assert!(is_wrong_login(change(Some("not it at all")).await));
    let verifies = w.hasher.verify_count();
    assert!(is_wrong_login(change(Some(&"x".repeat(1025))).await));
    assert_eq!(w.hasher.verify_count(), verifies);
    change(Some(PASSWORD)).await.unwrap();
    assert!(s.auth.current_user(&here.token).await.unwrap().is_some());
    assert!(s.auth.current_user(&other.token).await.unwrap().is_none());
    assert!(
        s.auth
            .login("ann", "a brand new one".into(), None)
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn password_rules_come_before_the_user_lookup() {
    async fn set(s: &Services, caller: &User, id: Uuid, pw: &str) -> DomainResult<()> {
        s.users
            .set_password(caller, id, pw.into(), None, None, None)
            .await
    }
    let s = World::new().services();
    let ann = user(&s, "ann", "member").await;
    let admin = user(&s, "root", "admin").await;
    assert!(
        matches!(set(&s, &ann, admin.id, "a brand new one").await, Err(DomainError::Forbidden(m)) if m == "Only an admin can do that.")
    );
    assert!(is_validation(
        set(&s, &admin, ann.id, "short").await,
        "password: at least 10 characters."
    ));
    assert!(
        matches!(set(&s, &admin, Uuid::new_v4(), "a brand new one").await, Err(DomainError::NotFound(m)) if m == "No such user.")
    );
}

#[tokio::test]
async fn admin_reset_needs_no_current_password_and_ends_all_their_sessions() {
    let s = World::new().services();
    let ann = user(&s, "ann", "member").await;
    let admin = user(&s, "root", "admin").await;
    let (_, theirs) = s.auth.login("ann", PASSWORD.into(), None).await.unwrap();
    let (_, mine) = s.auth.login("root", PASSWORD.into(), None).await.unwrap();
    s.users
        .set_password(
            &admin,
            ann.id,
            "a brand new one".into(),
            None,
            Some(&mine.token),
            None,
        )
        .await
        .unwrap();
    assert!(s.auth.current_user(&theirs.token).await.unwrap().is_none());
    assert!(s.auth.current_user(&mine.token).await.unwrap().is_some());
}

/// Changes the user's password behind the service's back while it verifies the current one.
struct RacingHasher {
    inner: FakePasswordHasher,
    store: Arc<MemoryStore>,
    id: Uuid,
}

#[async_trait::async_trait]
impl PasswordHasher for RacingHasher {
    async fn hash(&self, password: String) -> DomainResult<String> {
        self.inner.hash(password).await
    }

    async fn verify(&self, password: String, hash: Option<String>) -> DomainResult<bool> {
        let ok = self.inner.verify(password, hash).await?;
        self.store
            .set_password_hash(self.id, "raced", None, None)
            .await?;
        Ok(ok)
    }
}

#[tokio::test]
async fn a_lost_race_on_an_own_password_change_is_a_wrong_password() {
    let mut w = World::new();
    let ann = user(&w.services(), "ann", "member").await;
    w.deps.hasher = Arc::new(RacingHasher {
        inner: FakePasswordHasher::default(),
        store: w.store.clone(),
        id: ann.id,
    });
    let s = w.services();
    let r = s
        .users
        .set_password(
            &ann,
            ann.id,
            "a brand new one".into(),
            Some(PASSWORD.into()),
            None,
            None,
        )
        .await;
    assert!(is_wrong_login(r));
}

#[tokio::test]
async fn media_names_are_checked_and_files_are_found() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap().image;
    assert_eq!(s.media.get(&img.file_name).await.unwrap(), b"jpeg");
    let missing = format!("{}.jpg", Uuid::new_v4());
    for bad in ["../x.jpg", "x.png", "", missing.as_str()] {
        assert!(
            matches!(
                s.media.get(bad).await,
                Err(DomainError::NotFound(m)) if m == "Image not found."
            ),
            "{bad}"
        );
    }
}

#[tokio::test]
async fn upload_refuses_non_images_and_survives_a_failed_rendition() {
    let mut w = World::new();
    let u = user(&w.services(), "ann", "admin").await;
    assert!(matches!(
        w.services().media.upload(u.id, vec![]).await,
        Err(DomainError::UnsupportedMedia(_))
    ));
    w.deps.codec = Arc::new(FakeImageCodec {
        display_fails: true,
    });
    let img = w
        .services()
        .media
        .upload(u.id, b"jpeg".to_vec())
        .await
        .unwrap()
        .image;
    assert!(img.display_file_name.is_none());
}

#[tokio::test]
async fn delete_images_removes_row_and_files() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap().image;
    s.media.delete_images(&[img.id]).await;
    assert!(s.media.get(&img.file_name).await.is_err());
    assert!(is_validation(
        s.recipes
            .create(
                u.id,
                RecipeInput {
                    image_id: Some(img.id),
                    ..input("Soup")
                }
            )
            .await,
        "imageId/photoImageIds: unknown image."
    ));
}

#[tokio::test]
async fn backfill_renders_the_missing_displays() {
    let mut w = World::new();
    let u = user(&w.services(), "ann", "admin").await;
    w.deps.codec = Arc::new(FakeImageCodec {
        display_fails: true,
    });
    let img = w
        .services()
        .media
        .upload(u.id, b"jpeg".to_vec())
        .await
        .unwrap()
        .image;
    w.deps.codec = Arc::new(FakeImageCodec::default());
    let m = w.services().maintenance;
    let report = m.backfill_displays().await.unwrap();
    assert_eq!((report.made, report.skipped.len()), (1, 0));
    assert_eq!(
        w.services()
            .media
            .get(&format!("{}.display.jpg", img.id))
            .await
            .unwrap(),
        b"display:jpeg"
    );
    assert_eq!(m.backfill_displays().await.unwrap().made, 0);
}

#[tokio::test]
async fn purge_cutoffs_are_strict() {
    let w = World::new();
    let s = w.services();
    let u = user(&s, "ann", "admin").await;
    let r = s.recipes.create(u.id, input("Soup")).await.unwrap().id;
    s.recipes.delete(r).await.unwrap();
    s.auth.start_session(u.id).await.unwrap();
    let purge = || s.maintenance.purge();
    w.clock.advance(Duration::days(1));
    assert_eq!(
        (
            purge().await.unwrap().recipes,
            purge().await.unwrap().sessions
        ),
        (0, 0)
    );
    w.clock.advance(Duration::seconds(1));
    assert_eq!(purge().await.unwrap().recipes, 1);
    w.clock.advance(Duration::days(29) - Duration::seconds(1));
    assert_eq!(purge().await.unwrap().sessions, 0);
    w.clock.advance(Duration::seconds(1));
    assert_eq!(purge().await.unwrap().sessions, 1);
}

/// The image repository with switches for the calls that must fail.
struct FlakyImages {
    inner: Arc<MemoryStore>,
    fail_add: bool,
    fail_delete: bool,
}

#[async_trait]
impl ImageRepo for FlakyImages {
    async fn add(&self, image: Image) -> DomainResult<()> {
        if self.fail_add {
            return Err(DomainError::Internal("add failed".into()));
        }
        self.inner.add(image).await
    }

    async fn delete(&self, ids: &[Uuid]) -> DomainResult<()> {
        if self.fail_delete {
            return Err(DomainError::Internal("delete failed".into()));
        }
        self.inner.delete(ids).await
    }

    async fn set_display_file(&self, id: Uuid, file_name: &str) -> DomainResult<bool> {
        self.inner.set_display_file(id, file_name).await
    }

    async fn without_display_file(&self) -> DomainResult<Vec<Uuid>> {
        self.inner.without_display_file().await
    }
}

/// A media store that refuses to write renditions (`*.display.jpg`).
struct NoRenditions(Arc<MemoryMedia>);

#[async_trait]
impl MediaStore for NoRenditions {
    async fn put(&self, name: &str, bytes: Vec<u8>) -> DomainResult<()> {
        if name.ends_with(".display.jpg") {
            return Err(DomainError::Internal("disk full".into()));
        }
        self.0.put(name, bytes).await
    }

    async fn get(&self, name: &str) -> DomainResult<Option<Vec<u8>>> {
        self.0.get(name).await
    }

    async fn delete(&self, name: &str) -> DomainResult<()> {
        self.0.delete(name).await
    }
}

fn world_with_media() -> (World, Arc<MemoryMedia>) {
    let mut w = World::new();
    let media = Arc::new(MemoryMedia::default());
    w.deps.media = media.clone();
    (w, media)
}

#[tokio::test]
async fn a_failed_row_insert_removes_both_files_and_returns_the_error() {
    let (mut w, media) = world_with_media();
    let u = user(&w.services(), "ann", "admin").await;
    w.deps.images = Arc::new(FlakyImages {
        inner: w.store.clone(),
        fail_add: true,
        fail_delete: false,
    });
    let r = w.services().media.upload(u.id, b"jpeg".to_vec()).await;
    assert!(matches!(r, Err(DomainError::Internal(m)) if m == "add failed"));
    assert!(media.names().is_empty(), "{:?}", media.names());
}

#[tokio::test]
async fn a_rendition_that_cannot_be_written_is_reported_and_the_original_kept() {
    let (mut w, media) = world_with_media();
    let u = user(&w.services(), "ann", "admin").await;
    w.deps.media = Arc::new(NoRenditions(media.clone()));
    let stored = w
        .services()
        .media
        .upload(u.id, b"jpeg".to_vec())
        .await
        .unwrap();
    assert!(stored.image.display_file_name.is_none());
    assert!(matches!(&stored.rendition_error, Some(DomainError::Internal(m)) if m == "disk full"));
    assert_eq!(media.names(), std::slice::from_ref(&stored.image.file_name));
    // A rendition that was written is not an error.
    let (w2, _) = world_with_media();
    let ok = w2
        .services()
        .media
        .upload(u.id, b"jpeg".to_vec())
        .await
        .unwrap();
    assert!(ok.rendition_error.is_none() && ok.image.display_file_name.is_some());
}

#[tokio::test]
async fn delete_images_says_when_the_rows_could_not_be_deleted() {
    let (mut w, media) = world_with_media();
    let u = user(&w.services(), "ann", "admin").await;
    let id = w
        .services()
        .media
        .upload(u.id, b"jpeg".to_vec())
        .await
        .unwrap()
        .image
        .id;
    w.deps.images = Arc::new(FlakyImages {
        inner: w.store.clone(),
        fail_add: false,
        fail_delete: true,
    });
    assert!(!w.services().media.delete_images(&[id]).await);
    assert_eq!(media.names().len(), 2, "files are kept when the rows stay");
    assert!(World::new().services().media.delete_images(&[id]).await);
}

fn rate_limited<T>(r: &DomainResult<T>) -> Option<u64> {
    match r {
        Err(DomainError::RateLimited { retry_after_secs }) => Some(*retry_after_secs),
        _ => None,
    }
}

#[tokio::test]
async fn a_locked_login_does_no_hashing_and_clears_after_the_wait() {
    let w = World::new();
    let s = w.services();
    user(&s, "ann", "admin").await;
    for _ in 0..5 {
        assert!(is_wrong_login(
            s.auth.login("ann", "nope nope nope".into(), None).await
        ));
    }
    let verifies = w.hasher.verify_count();
    let locked = s.auth.login("ann", PASSWORD.into(), None).await;
    assert_eq!(rate_limited(&locked), Some(30));
    assert_eq!(w.hasher.verify_count(), verifies);
    w.clock.advance(Duration::seconds(30));
    assert!(s.auth.login("ann", PASSWORD.into(), None).await.is_ok());
}

#[tokio::test]
async fn an_over_long_password_counts_as_a_guess() {
    let s = World::new().services();
    user(&s, "ann", "admin").await;
    for _ in 0..5 {
        assert!(is_wrong_login(
            s.auth.login("ann", "x".repeat(1025), None).await
        ));
    }
    assert!(rate_limited(&s.auth.login("ann", PASSWORD.into(), None).await).is_some());
}

#[tokio::test]
async fn own_password_change_locks_per_user_and_leaves_admin_resets_alone() {
    let w = World::new();
    let s = w.services();
    let ann = user(&s, "ann", "member").await;
    let admin = user(&s, "root", "admin").await;
    let change = |current: &str| {
        s.users.set_password(
            &ann,
            ann.id,
            "a brand new one".into(),
            Some(current.into()),
            None,
            None,
        )
    };
    for _ in 0..5 {
        assert!(is_wrong_login(change("not it at all").await));
    }
    let verifies = w.hasher.verify_count();
    assert_eq!(rate_limited(&change(PASSWORD).await), Some(30));
    assert_eq!(w.hasher.verify_count(), verifies);
    // The admin's reset checks no password, so it is never throttled.
    for _ in 0..8 {
        s.users
            .set_password(&admin, ann.id, "reset by admin ok".into(), None, None, None)
            .await
            .unwrap();
    }
    w.clock.advance(Duration::seconds(30));
    // The reset changed the password, so the old "right" one is just wrong now (and the count carries on).
    assert!(is_wrong_login(change(PASSWORD).await));
}
