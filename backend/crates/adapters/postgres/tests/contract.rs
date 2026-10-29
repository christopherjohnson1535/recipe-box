//! The Postgres adapter against the storage contract suite, one throwaway schema per case (docs/adr/0002).
//! Skips with a message when `TEST_DATABASE_URL` is unset.

use std::{
    collections::HashMap,
    str::FromStr,
    sync::{Arc, Mutex},
};

use adapter_postgres::{
    PgCookLogRepo, PgFavouriteRepo, PgGoogleConnectionRepo, PgGroceryRepo, PgIdentityRepo,
    PgImageRepo, PgRecipeRepo, PgSessionRepo, PgSettingsRepo, PgStorageHealth, PgTagRepo,
    PgUserRepo, migrate,
};
use domain::{
    grocery::{GeneratedItem, Section},
    uuid::Uuid,
};
use ports::{
    Clock, ListedRecipe,
    contract::{self, Capabilities, Stack},
};
use sqlx::{
    ConnectOptions, Connection, Executor,
    postgres::{PgConnectOptions, PgPoolOptions},
};

/// Hands out migrated schemas and drops them all when it goes away, panic or not.
struct Schemas {
    url: String,
    created: Mutex<Vec<String>>,
}

impl Schemas {
    /// `None` (with a message) when there is no test database.
    fn new() -> Option<Self> {
        let url = std::env::var("TEST_DATABASE_URL")
            .ok()
            .filter(|u| !u.trim().is_empty());
        if url.is_none() {
            eprintln!(
                "SKIPPED: TEST_DATABASE_URL is not set, the Postgres contract suite did not run"
            );
        }
        url.map(|url| Self {
            url,
            created: Mutex::default(),
        })
    }

    /// A stack over a fresh, migrated schema. Blocks the worker thread, so tests use the multi-thread runtime.
    fn stack(&self, clock: Arc<dyn Clock>) -> Stack {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(self.stack_async(clock))
        })
    }

    async fn stack_async(&self, clock: Arc<dyn Clock>) -> Stack {
        let schema = format!("contract_{}", Uuid::new_v4().simple());
        let mut admin = PgConnectOptions::from_str(&self.url)
            .unwrap()
            .connect()
            .await
            .expect("connect to the test database");
        // The extension is database-wide; create it once in `public` (serialised, cases run in parallel).
        let mut tx = admin.begin().await.unwrap();
        tx.execute("select pg_advisory_xact_lock(727274)")
            .await
            .unwrap();
        tx.execute("create extension if not exists citext with schema public")
            .await
            .unwrap();
        tx.commit().await.unwrap();
        self.created.lock().unwrap().push(schema.clone());
        admin
            .execute(sqlx::AssertSqlSafe(format!("create schema {schema}")))
            .await
            .unwrap();
        let _ = admin.close().await;

        let opts = PgConnectOptions::from_str(&self.url)
            .unwrap()
            .options([("search_path", format!("{schema},public"))]);
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .unwrap();
        migrate(&pool).await.unwrap();
        Stack {
            recipes: Arc::new(PgRecipeRepo::new(pool.clone(), clock.clone())),
            images: Arc::new(PgImageRepo::new(pool.clone(), clock.clone())),
            users: Arc::new(PgUserRepo::new(pool.clone(), clock.clone())),
            sessions: Arc::new(PgSessionRepo::new(pool.clone(), clock.clone())),
            settings: Arc::new(PgSettingsRepo::new(pool.clone(), clock.clone())),
            tags: Arc::new(PgTagRepo::new(pool.clone())),
            grocery: Arc::new(PgGroceryRepo::new(pool.clone(), clock.clone())),
            google: Arc::new(PgGoogleConnectionRepo::new(pool.clone())),
            identities: Arc::new(PgIdentityRepo::new(pool.clone(), clock.clone())),
            cook_log: Arc::new(PgCookLogRepo::new(pool.clone(), clock.clone())),
            favourites: Arc::new(PgFavouriteRepo::new(pool.clone(), clock.clone())),
            health: Arc::new(PgStorageHealth::new(pool)),
        }
    }
}

impl Drop for Schemas {
    fn drop(&mut self) {
        let (url, schemas) = (
            self.url.clone(),
            std::mem::take(&mut *self.created.lock().unwrap()),
        );
        // Own thread and runtime: dropping can happen inside the test's runtime, which cannot block.
        let done = std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            rt.block_on(async {
                let mut conn = PgConnectOptions::from_str(&url)
                    .unwrap()
                    .connect()
                    .await
                    .unwrap();
                for s in schemas {
                    conn.execute(sqlx::AssertSqlSafe(format!(
                        "drop schema if exists {s} cascade"
                    )))
                    .await
                    .unwrap();
                }
            });
        })
        .join();
        if done.is_err() {
            eprintln!("could not drop the contract test schemas; they may leak");
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn recipes_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::recipe_repo(|c| db.stack(c), Capabilities::ALL).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn accounts_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::user_repo(|c| db.stack(c)).await;
    contract::session_repo(|c| db.stack(c)).await;
    contract::settings_repo(|c| db.stack(c)).await;
    contract::tag_repo(|c| db.stack(c)).await;
    contract::image_repo(|c| db.stack(c)).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn groceries_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::grocery_repo(|c| db.stack(c)).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn google_connections_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::google_connection_repo(|c| db.stack(c)).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn the_cook_log_meets_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::cook_log_repo(|c| db.stack(c)).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn identities_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::identity_repo(|c| db.stack(c)).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn storage_answers_its_ping() {
    let Some(db) = Schemas::new() else { return };
    let s = db.stack(Arc::new(contract::ManualClock::default()));
    contract::storage_health(&*s.health).await;
}

/// One generated item per recipe, keyed by its first ingredient line.
fn from_recipes(recipes: &[ListedRecipe], _: &HashMap<String, Section>) -> Vec<GeneratedItem> {
    recipes
        .iter()
        .map(|r| GeneratedItem {
            key: r.ingredients[0].text.clone(),
            name: r.ingredients[0].text.clone(),
            amounts: vec![],
            section: Section::Other,
            recipe_ids: vec![r.recipe_id],
        })
        .collect()
}

/// The list lock, forced: A's recompute has read its recipes and is about to write when B adds a recipe and
/// recomputes. With the lock B waits for A, so B's recompute sees both recipes; without it B finishes inside A's
/// window and A then overwrites B's items with a set that lacks them. A waits for B only briefly (a bounded wait
/// that B never meets while the lock holds), so this is also the case that proves the lock by failing without it.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn overlapping_recomputes_cannot_overwrite_each_other() {
    use std::{sync::mpsc, time::Duration};

    use domain::{Ingredient, NewUser, ROLE_ADMIN, RecipeInput};

    let Some(db) = Schemas::new() else { return };
    let s = db.stack(Arc::new(contract::ManualClock::default()));
    let user = s
        .users
        .create(NewUser {
            username: "tester".into(),
            display_name: "Tester".into(),
            password_hash: "hash".into(),
            role: ROLE_ADMIN.into(),
            email: None,
        })
        .await
        .unwrap()
        .id;
    let recipe = |title: &str, line: &str| RecipeInput {
        title: title.into(),
        ingredients: vec![Ingredient {
            text: line.into(),
            section: None,
        }],
        ..Default::default()
    };
    let apple = s
        .recipes
        .create(user, recipe("A", "apple"))
        .await
        .unwrap()
        .id;
    let pear = s
        .recipes
        .create(user, recipe("B", "pear"))
        .await
        .unwrap()
        .id;
    let list = s.grocery.get_or_create_list().await.unwrap();

    let (inside_tx, inside_rx) = tokio::sync::oneshot::channel();
    let (done_tx, done_rx) = mpsc::channel::<()>();
    let (inside_tx, done_rx) = (
        std::sync::Mutex::new(Some(inside_tx)),
        std::sync::Mutex::new(done_rx),
    );
    let b = {
        let (grocery, list_id) = (s.grocery.clone(), list.id);
        tokio::spawn(async move {
            inside_rx.await.unwrap();
            grocery.add_recipe(list_id, pear, 1.0).await.unwrap();
            grocery.recompute(list_id, &from_recipes).await.unwrap();
            let _ = done_tx.send(());
        })
    };

    s.grocery.add_recipe(list.id, apple, 1.0).await.unwrap();
    s.grocery
        .recompute(list.id, &move |recipes, overrides| {
            let items = from_recipes(recipes, overrides);
            if let Some(tx) = inside_tx.lock().unwrap().take() {
                let _ = tx.send(());
                // Hold the computed set while B tries to get its recipe in.
                let _ = done_rx
                    .lock()
                    .unwrap()
                    .recv_timeout(Duration::from_millis(750));
            }
            items
        })
        .await
        .unwrap();
    b.await.unwrap();

    let mut keys: Vec<String> = s
        .grocery
        .items(list.id)
        .await
        .unwrap()
        .into_iter()
        .map(|i| i.key)
        .collect();
    keys.sort();
    assert_eq!(keys, ["apple", "pear"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn favourites_meet_the_contract() {
    let Some(db) = Schemas::new() else { return };
    contract::favourite_repo(|c| db.stack(c)).await;
}
