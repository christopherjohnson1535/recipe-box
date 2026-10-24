//! One test per rule the services own, over the in-memory adapters and a manual clock.

use std::sync::Arc;

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryMedia, MemoryStore,
};
use app::{Deps, Services};
use domain::{
    DomainError, DomainResult, Recipe, RecipeInput, Settings, Sort, User, chrono::Duration,
    uuid::Uuid,
};
use ports::{Clock, PasswordHasher, UserRepo, contract::ManualClock};

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
            health: store.clone(),
            media,
            hasher: hasher.clone(),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock: clock.clone(),
            session_days: 30,
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
        .create(name, name, PASSWORD.into(), role)
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
async fn search_checks_limit_then_offset() {
    let s = World::new().services();
    let search = |limit, offset| s.recipes.search(None, None, Sort::Default, limit, offset);
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
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap();
    let with_image = || RecipeInput {
        image_id: Some(img.id),
        ..input("Soup")
    };
    let shown = |r: &Recipe| r.image_display_file.is_some();
    let r = s.recipes.create(u.id, with_image()).await.unwrap();
    assert!(shown(&r) && shown(&s.recipes.get(r.id).await.unwrap()));
    let listed = || s.recipes.search(None, None, Sort::Default, 10, 0);
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
    assert!(is_wrong_login(s.auth.login("ann", long).await));
    assert_eq!(w.hasher.verify_count(), 0);
}

#[tokio::test]
async fn unknown_user_and_wrong_password_look_the_same() {
    let w = World::new();
    let s = w.services();
    user(&s, "ann", "admin").await;
    assert!(is_wrong_login(
        s.auth.login("ann", "nope nope nope".into()).await
    ));
    assert!(is_wrong_login(s.auth.login("bob", PASSWORD.into()).await));
    assert_eq!(w.hasher.verify_count(), 2);
    // Case and padding in the username do not matter; the session lasts `session_days`.
    let (u, session) = s.auth.login("  ANN ", PASSWORD.into()).await.unwrap();
    assert_eq!(session.expires_at, w.clock.now() + Duration::days(30));
    let found = s.auth.current_user(&session.token).await.unwrap().unwrap();
    assert_eq!(found.id, u.id);
}

#[tokio::test]
async fn logout_ends_only_that_session() {
    let s = World::new().services();
    user(&s, "ann", "admin").await;
    let (_, a) = s.auth.login("ann", PASSWORD.into()).await.unwrap();
    let (_, b) = s.auth.login("ann", PASSWORD.into()).await.unwrap();
    s.auth.logout(None).await.unwrap();
    s.auth.logout(Some(&a.token)).await.unwrap();
    assert!(s.auth.current_user(&a.token).await.unwrap().is_none());
    assert!(s.auth.current_user(&b.token).await.unwrap().is_some());
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
        s.users.create(name, display, pw.into(), role).await
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
    let (_, here) = s.auth.login("ann", PASSWORD.into()).await.unwrap();
    let (_, other) = s.auth.login("ann", PASSWORD.into()).await.unwrap();
    let change = |current: Option<&str>| {
        s.users.set_password(
            &ann,
            ann.id,
            "a brand new one".into(),
            current.map(Into::into),
            Some(&here.token),
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
    assert!(s.auth.login("ann", "a brand new one".into()).await.is_ok());
}

#[tokio::test]
async fn password_rules_come_before_the_user_lookup() {
    async fn set(s: &Services, caller: &User, id: Uuid, pw: &str) -> DomainResult<()> {
        s.users
            .set_password(caller, id, pw.into(), None, None)
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
    let (_, theirs) = s.auth.login("ann", PASSWORD.into()).await.unwrap();
    let (_, mine) = s.auth.login("root", PASSWORD.into()).await.unwrap();
    s.users
        .set_password(
            &admin,
            ann.id,
            "a brand new one".into(),
            None,
            Some(&mine.token),
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
        )
        .await;
    assert!(is_wrong_login(r));
}

#[tokio::test]
async fn media_names_are_checked_and_files_are_found() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap();
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
        .unwrap();
    assert!(img.display_file_name.is_none());
}

#[tokio::test]
async fn delete_images_removes_row_and_files() {
    let s = World::new().services();
    let u = user(&s, "ann", "admin").await;
    let img = s.media.upload(u.id, b"jpeg".to_vec()).await.unwrap();
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
        .unwrap();
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

#[tokio::test]
async fn export_is_not_built() {
    let s = World::new().services();
    assert!(
        matches!(s.export.export(), Err(DomainError::NotImplemented(m)) if m == "Export is not built yet.")
    );
    assert!(
        matches!(s.export.import_backup(), Err(DomainError::NotImplemented(m)) if m == "Importing an export is not built yet.")
    );
}
