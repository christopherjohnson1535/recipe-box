//! The in-memory adapter against the storage contract suite.

use std::sync::Arc;

use adapter_memory::{FakePasswordHasher, MemoryMedia, MemoryStore};
use ports::{
    Clock,
    contract::{self, Capabilities, Stack},
};

fn stack(clock: Arc<dyn Clock>) -> Stack {
    let store = Arc::new(MemoryStore::new(clock));
    Stack {
        recipes: store.clone(),
        images: store.clone(),
        users: store.clone(),
        sessions: store.clone(),
        health: store.clone(),
        settings: store.clone(),
        tags: store.clone(),
        grocery: store.clone(),
        google: store,
    }
}

#[tokio::test]
async fn recipes_meet_the_contract() {
    contract::recipe_repo(stack, Capabilities::ALL).await;
}

#[tokio::test]
async fn an_adapter_can_decline_a_capability() {
    // The gated cases are skipped (and say so on stderr), the rest still run.
    let none = Capabilities {
        phrase_search: false,
        boolean_operators: false,
    };
    contract::recipe_repo(stack, none).await;
}

#[tokio::test]
async fn accounts_meet_the_contract() {
    contract::user_repo(stack).await;
    contract::session_repo(stack).await;
    contract::settings_repo(stack).await;
    contract::tag_repo(stack).await;
    contract::image_repo(stack).await;
}

#[tokio::test]
async fn groceries_meet_the_contract() {
    contract::grocery_repo(stack).await;
}

#[tokio::test]
async fn google_connections_meet_the_contract() {
    contract::google_connection_repo(stack).await;
}

#[tokio::test]
async fn media_meets_the_contract() {
    contract::media_store(MemoryMedia::default).await;
}

#[tokio::test]
async fn the_fake_hasher_meets_the_contract() {
    contract::password_hasher(FakePasswordHasher::default()).await;
}

#[tokio::test]
async fn storage_answers_its_ping() {
    let s = stack(Arc::new(contract::ManualClock::default()));
    contract::storage_health(&*s.health).await;
}

#[test]
fn the_manual_clock_moves_only_when_told() {
    let clock = contract::ManualClock::default();
    assert_eq!(clock.now(), contract::epoch());
    clock.advance(domain::chrono::Duration::seconds(5));
    assert_eq!(
        clock.now(),
        contract::epoch() + domain::chrono::Duration::seconds(5)
    );
}
