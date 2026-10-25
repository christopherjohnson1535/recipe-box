//! Sending the grocery list to Google Tasks (GRO-5) over the in-memory adapters and a scripted Google.

#[allow(dead_code)] // shared with the other test files
mod common;

use std::sync::{Arc, Mutex};

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, FakeTokenCipher, MemoryBackup,
    MemoryMedia, MemoryStore,
};
use app::{Deps, DisabledGoogleTasks, NoneExtractor, Services, TASK_LIST_TITLE, Throttle};
use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Ingredient, NewUser, RecipeInput, Secret, chrono::Duration,
    url::Url, uuid::Uuid,
};
use ports::{GoogleConnectionRepo, GoogleTasks, TaskSection, TokenCipher, contract::ManualClock};

/// `(access token, tasklist id asked for, title, sections)` of one `replace_list`.
type Replaced = (String, Option<String>, String, Vec<TaskSection>);

/// A Google that records what it was asked and answers from a script.
#[derive(Default)]
struct FakeGoogle {
    /// `access_token` answers `GoogleNotConnected` when set.
    refresh_is_dead: Mutex<bool>,
    revoke_fails: Mutex<bool>,
    /// The list id `replace_list` answers with.
    list_id: Mutex<String>,
    revoked: Mutex<Vec<String>>,
    replaced: Mutex<Vec<Replaced>>,
}

#[async_trait]
impl GoogleTasks for FakeGoogle {
    fn configured(&self) -> bool {
        true
    }

    fn consent_url(&self, state: &str) -> DomainResult<Url> {
        Ok(Url::parse(&format!("https://accounts.example/auth?state={state}")).unwrap())
    }

    async fn exchange_code(&self, code: &str) -> DomainResult<Secret> {
        match code {
            "good" => Ok(Secret::new("refresh-1")),
            _ => Err(DomainError::Google("refused".into())),
        }
    }

    async fn access_token(&self, refresh: &Secret) -> DomainResult<Secret> {
        if *self.refresh_is_dead.lock().unwrap() {
            return Err(DomainError::GoogleNotConnected);
        }
        Ok(Secret::new(format!("access-for-{}", refresh.expose())))
    }

    async fn revoke(&self, token: &Secret) -> DomainResult<()> {
        self.revoked.lock().unwrap().push(token.expose().into());
        if *self.revoke_fails.lock().unwrap() {
            return Err(DomainError::Google("down".into()));
        }
        Ok(())
    }

    async fn replace_list(
        &self,
        access: &Secret,
        tasklist_id: Option<&str>,
        title: &str,
        sections: &[TaskSection],
    ) -> DomainResult<String> {
        self.replaced.lock().unwrap().push((
            access.expose().into(),
            tasklist_id.map(Into::into),
            title.into(),
            sections.to_vec(),
        ));
        Ok(self.list_id.lock().unwrap().clone())
    }
}

struct World {
    clock: Arc<ManualClock>,
    store: Arc<MemoryStore>,
    /// The scripted Google (unused when the world is built without Google).
    google: Arc<FakeGoogle>,
    services: Services,
    user: Uuid,
}

impl World {
    async fn new() -> Self {
        let google = Arc::new(FakeGoogle::default());
        *google.list_id.lock().unwrap() = "list-1".into();
        Self::build(google.clone(), google).await
    }

    /// A server without a Google OAuth client.
    async fn disabled() -> Self {
        Self::build(
            Arc::new(DisabledGoogleTasks),
            Arc::new(FakeGoogle::default()),
        )
        .await
    }

    async fn build(port: Arc<dyn GoogleTasks>, google: Arc<FakeGoogle>) -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let services = Services::new(Deps {
            recipes: store.clone(),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            google_connections: store.clone(),
            health: store.clone(),
            media: Arc::new(MemoryMedia::default()),
            backup: Arc::new(MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock: clock.clone(),
            extractor: Arc::new(NoneExtractor),
            fetcher: Arc::new(common::FakeFetcher::default()),
            reader: Arc::new(common::FakeReader::default()),
            google: port,
            cipher: Arc::new(FakeTokenCipher),
            spawner: Arc::new(common::CollectingSpawner::default()),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: Throttle::new(),
        });
        let user = ports::UserRepo::create(
            &*store,
            NewUser {
                username: "cook".into(),
                display_name: "Cook".into(),
                password_hash: "hash".into(),
                role: "member".into(),
            },
        )
        .await
        .unwrap()
        .id;
        Self {
            clock,
            store,
            google,
            services,
            user,
        }
    }

    /// Puts a recipe with these lines on the grocery list.
    async fn on_the_list(&self, lines: &[&str]) {
        self.clock.advance(Duration::seconds(1));
        let id = self
            .services
            .recipes
            .create(
                self.user,
                RecipeInput {
                    title: "Dinner".into(),
                    ingredients: lines
                        .iter()
                        .map(|t| Ingredient {
                            text: (*t).into(),
                            section: None,
                        })
                        .collect(),
                    ..Default::default()
                },
            )
            .await
            .unwrap()
            .id;
        self.services.grocery.add_recipe(id, None).await.unwrap();
    }

    async fn connect(&self) {
        self.services
            .google
            .finish(self.user, "good")
            .await
            .unwrap();
    }

    fn sent(&self) -> Vec<Replaced> {
        self.google.replaced.lock().unwrap().clone()
    }
}

fn section(title: &str, items: &[&str]) -> TaskSection {
    TaskSection {
        title: title.into(),
        items: items.iter().map(|s| (*s).into()).collect(),
    }
}

#[tokio::test]
async fn without_google_every_call_says_so() {
    let w = World::disabled().await;
    let g = &w.services.google;
    let status = g.status(w.user).await.unwrap();
    assert!(!status.configured && !status.connected && status.connected_at.is_none());
    assert!(matches!(g.consent(), Err(DomainError::GoogleDisabled)));
    assert!(matches!(
        g.finish(w.user, "good").await,
        Err(DomainError::GoogleDisabled)
    ));
    assert!(matches!(
        g.export(w.user, false).await,
        Err(DomainError::GoogleDisabled)
    ));
    assert!(g.disconnect(w.user).await.unwrap().is_none());
    // The grocery list itself works.
    assert!(w.services.grocery.get().await.unwrap().items.is_empty());
}

#[tokio::test]
async fn consent_hands_out_a_fresh_state_each_time() {
    let w = World::new().await;
    let (url, a) = w.services.google.consent().unwrap();
    let (_, b) = w.services.google.consent().unwrap();
    assert_ne!(a, b);
    assert!(url.as_str().ends_with(&format!("state={a}")), "{url}");
}

#[tokio::test]
async fn finishing_stores_the_token_sealed_and_status_follows() {
    let w = World::new().await;
    let before = w.services.google.status(w.user).await.unwrap();
    assert!(before.configured && !before.connected);

    w.clock.advance(Duration::minutes(5));
    w.connect().await;
    let after = w.services.google.status(w.user).await.unwrap();
    assert!(after.connected);
    assert_eq!(
        after.connected_at,
        Some(ports::contract::epoch() + Duration::minutes(5))
    );
    let stored = w.store.get(w.user).await.unwrap().unwrap();
    assert_eq!(
        FakeTokenCipher.open(&stored.sealed_token).unwrap().expose(),
        "refresh-1"
    );
    assert_ne!(stored.sealed_token, b"refresh-1");
}

#[tokio::test]
async fn a_refused_code_stores_nothing() {
    let w = World::new().await;
    let r = w.services.google.finish(w.user, "bad").await;
    assert!(matches!(r, Err(DomainError::Google(_))), "{r:?}");
    assert!(!w.services.google.status(w.user).await.unwrap().connected);
}

#[tokio::test]
async fn export_needs_a_connection() {
    let w = World::new().await;
    let r = w.services.google.export(w.user, false).await;
    assert!(matches!(r, Err(DomainError::GoogleNotConnected)), "{r:?}");
    assert!(w.sent().is_empty());
}

#[tokio::test]
async fn export_sends_unticked_items_by_section_in_store_order() {
    let w = World::new().await;
    w.on_the_list(&[
        "1 cup rice",
        "2 apples",
        "1 lb chicken thighs",
        "1 cup milk",
        "2 tbsp milk",
        "salt",
        "3 onions",
        "1 cup frozen peas",
        "1 widget",
    ])
    .await;
    // Tick the peas: ticked items stay home.
    let list = w.services.grocery.get().await.unwrap();
    let peas = list
        .items
        .iter()
        .find(|i| i.item.name == "frozen peas")
        .unwrap();
    w.services
        .grocery
        .update_item(
            peas.item.id,
            app::ItemPatch {
                checked: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    w.connect().await;

    let sent = w.services.google.export(w.user, false).await.unwrap();
    assert_eq!(
        (sent.task_list_title.as_str(), sent.sections, sent.items),
        (TASK_LIST_TITLE, 5, 6)
    );
    let calls = w.sent();
    assert_eq!(calls.len(), 1);
    let (access, list_id, title, sections) = &calls[0];
    assert_eq!(access, "access-for-refresh-1");
    assert_eq!(list_id, &None);
    assert_eq!(title, "Groceries");
    assert_eq!(
        sections,
        &[
            section("Produce", &["2 apples", "3 onions"]),
            section("Meat", &["1 lb chicken thighs"]),
            section("Fridge", &["1 cup + 2 tbsp milk"]),
            section("Pantry", &["1 cup rice"]),
            section("Other", &["1 widget"]),
        ]
    );
}

#[tokio::test]
async fn staples_go_only_when_asked() {
    let w = World::new().await;
    w.on_the_list(&["2 apples", "salt"]).await;
    w.connect().await;

    let without = w.services.google.export(w.user, false).await.unwrap();
    assert_eq!((without.sections, without.items), (1, 1));
    let with = w.services.google.export(w.user, true).await.unwrap();
    assert_eq!((with.sections, with.items), (2, 2));
    let calls = w.sent();
    assert_eq!(calls[0].3, [section("Produce", &["2 apples"])]);
    assert_eq!(
        calls[1].3,
        [
            section("Produce", &["2 apples"]),
            section("Pantry", &["salt"])
        ]
    );
}

#[tokio::test]
async fn an_empty_list_still_empties_the_google_list() {
    let w = World::new().await;
    w.connect().await;
    let sent = w.services.google.export(w.user, false).await.unwrap();
    assert_eq!((sent.sections, sent.items), (0, 0));
    assert_eq!(w.sent()[0].3, []);
}

#[tokio::test]
async fn the_list_id_is_remembered_and_follows_google() {
    let w = World::new().await;
    w.on_the_list(&["2 apples"]).await;
    w.connect().await;
    w.services.google.export(w.user, false).await.unwrap();
    w.services.google.export(w.user, false).await.unwrap();
    // Google made a new list (the old one was deleted there).
    *w.google.list_id.lock().unwrap() = "list-2".into();
    w.services.google.export(w.user, false).await.unwrap();
    w.services.google.export(w.user, false).await.unwrap();
    let asked: Vec<Option<String>> = w.sent().into_iter().map(|c| c.1).collect();
    assert_eq!(
        asked,
        [
            None,
            Some("list-1".into()),
            Some("list-1".into()),
            Some("list-2".into())
        ]
    );
}

#[tokio::test]
async fn a_token_google_no_longer_accepts_is_forgotten() {
    let w = World::new().await;
    w.on_the_list(&["2 apples"]).await;
    w.connect().await;
    *w.google.refresh_is_dead.lock().unwrap() = true;
    let r = w.services.google.export(w.user, false).await;
    assert!(matches!(r, Err(DomainError::GoogleNotConnected)), "{r:?}");
    assert!(!w.services.google.status(w.user).await.unwrap().connected);
    assert!(w.sent().is_empty());
    // Asking again is the plain "not connected".
    let again = w.services.google.export(w.user, false).await;
    assert!(matches!(again, Err(DomainError::GoogleNotConnected)));
}

#[tokio::test]
async fn a_token_sealed_with_another_key_is_forgotten_too() {
    let w = World::new().await;
    w.store
        .upsert(w.user, b"garbage".to_vec(), ports::contract::epoch())
        .await
        .unwrap();
    let r = w.services.google.export(w.user, false).await;
    assert!(matches!(r, Err(DomainError::GoogleNotConnected)), "{r:?}");
    assert!(w.store.get(w.user).await.unwrap().is_none());
}

#[tokio::test]
async fn disconnecting_revokes_and_forgets() {
    let w = World::new().await;
    w.connect().await;
    let problem = w.services.google.disconnect(w.user).await.unwrap();
    assert!(problem.is_none());
    assert_eq!(*w.google.revoked.lock().unwrap(), ["refresh-1"]);
    assert!(w.store.get(w.user).await.unwrap().is_none());
    // Nothing connected: nothing to revoke, still fine.
    assert!(
        w.services
            .google
            .disconnect(w.user)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(w.google.revoked.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_failed_revoke_still_forgets_the_connection() {
    let w = World::new().await;
    w.connect().await;
    *w.google.revoke_fails.lock().unwrap() = true;
    let problem = w.services.google.disconnect(w.user).await.unwrap();
    assert!(
        matches!(problem, Some(DomainError::Google(_))),
        "{problem:?}"
    );
    assert!(w.store.get(w.user).await.unwrap().is_none());
}
