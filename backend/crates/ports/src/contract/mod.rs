//! The storage contract suite: the written definition of how any storage must behave.
//!
//! An adapter crate adds `ports` with the `contract` feature as a dev-dependency and calls the suite from a test:
//!
//! ```ignore
//! ports::contract::repos(|clock| my_stack(clock), ports::contract::Capabilities::ALL).await;
//! ports::contract::media_store(MyMedia::new).await;
//! ```
//!
//! Each case builds a fresh [`Stack`] over a [`ManualClock`], so time only moves when the case moves it: no wall
//! clock, no sleeping, the same result on every run. A case an adapter cannot support is gated by a
//! [`Capabilities`] flag; the suite prints which case it skipped and why, it never skips silently.

mod accounts;
mod infra;
mod recipes;

use std::sync::{Arc, Mutex};

use domain::{
    NewUser, ROLE_ADMIN, RecipeInput,
    chrono::{DateTime, Duration, Utc},
    uuid::Uuid,
};

use crate::{
    Clock, ImageRepo, RecipeRepo, SessionRepo, SettingsRepo, StorageHealth, TagRepo, UserRepo,
};

pub use accounts::{image_repo, session_repo, settings_repo, tag_repo, user_repo};
pub use infra::{media_store, password_hasher, storage_health};
pub use recipes::recipe_repo;

/// The repositories of one adapter, sharing one backing store (recipes reference users and images) and built
/// with the clock a case passes in.
pub struct Stack {
    pub recipes: Arc<dyn RecipeRepo>,
    pub images: Arc<dyn ImageRepo>,
    pub users: Arc<dyn UserRepo>,
    pub sessions: Arc<dyn SessionRepo>,
    pub settings: Arc<dyn SettingsRepo>,
    pub tags: Arc<dyn TagRepo>,
    pub health: Arc<dyn StorageHealth>,
}

/// Search features an adapter may not offer. A flag set to `false` skips the cases that need it, visibly.
#[derive(Debug, Clone, Copy)]
pub struct Capabilities {
    /// `"two words"` matches the words next to each other, in order.
    pub phrase_search: bool,
    /// `-word` excludes and `a or b` matches either.
    pub boolean_operators: bool,
}

impl Capabilities {
    /// Everything: what the Postgres adapter must offer.
    pub const ALL: Self = Self {
        phrase_search: true,
        boolean_operators: true,
    };
}

/// Prints that a case did not run. Called when the adapter did not declare `capability`.
fn skip(case: &str, capability: &str) {
    eprintln!("contract: SKIPPED {case}: adapter does not declare `{capability}`");
}

/// 2026-01-01T00:00:00Z, where every [`ManualClock`] starts.
pub fn epoch() -> DateTime<Utc> {
    DateTime::from_timestamp(1_767_225_600, 0).expect("valid timestamp")
}

/// A clock that only moves when told to. Share it between the case and the adapter.
pub struct ManualClock(Mutex<DateTime<Utc>>);

impl ManualClock {
    pub fn new() -> Self {
        Self(Mutex::new(epoch()))
    }

    pub fn advance(&self, by: Duration) {
        *self.0.lock().expect("clock lock") += by;
    }
}

impl Default for ManualClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for ManualClock {
    fn now(&self) -> DateTime<Utc> {
        *self.0.lock().expect("clock lock")
    }
}

pub(crate) fn ms(n: i64) -> Duration {
    Duration::milliseconds(n)
}

pub(crate) fn new_user(username: &str, display_name: &str, role: &str) -> NewUser {
    NewUser {
        username: username.into(),
        display_name: display_name.into(),
        password_hash: "hash".into(),
        role: role.into(),
    }
}

/// A case's world: a fresh stack, its clock and one admin who creates things.
pub(crate) struct Ctx {
    pub s: Stack,
    pub clock: Arc<ManualClock>,
    pub user: Uuid,
}

impl Ctx {
    pub async fn new<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) -> Self {
        let clock = Arc::new(ManualClock::new());
        let s = make(clock.clone());
        let user = s
            .users
            .create(new_user("tester", "Tester", ROLE_ADMIN))
            .await
            .expect("create the case's user")
            .id;
        Self { s, clock, user }
    }

    /// Creates a recipe one second after the previous one, so `created_at` order is the creation order.
    pub async fn add(
        &self,
        title: &str,
        ingredients: &[&str],
        minutes: Option<i32>,
        tags: &[&str],
    ) -> Uuid {
        self.clock.advance(Duration::seconds(1));
        let input = RecipeInput {
            title: title.into(),
            ingredients: ingredients
                .iter()
                .map(|t| domain::Ingredient {
                    text: (*t).into(),
                    section: None,
                })
                .collect(),
            total_minutes: minutes,
            tags: tags.iter().map(|t| (*t).into()).collect(),
            ..Default::default()
        };
        self.s
            .recipes
            .create(self.user, input)
            .await
            .expect("create recipe")
            .id
    }
}
