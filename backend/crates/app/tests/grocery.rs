//! The grocery list rules (GRO) over the in-memory adapters and a manual clock.

#[allow(dead_code)] // shared with the other test files
mod common;

use std::sync::Arc;

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryBackup, MemoryMedia, MemoryStore,
};
use app::{Deps, GroceryItemView, GroceryListView, ItemPatch, NoneExtractor, Services, Throttle};
use domain::{
    DomainError, DomainResult, Ingredient, RecipeInput,
    chrono::Duration,
    grocery::{Amount, Section},
    uuid::Uuid,
};
use ports::contract::ManualClock;

struct World {
    clock: Arc<ManualClock>,
    services: Services,
}

impl World {
    fn new() -> Self {
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
            identities: store.clone(),
            cook_log: store.clone(),
            google_signin: Arc::new(app::DisabledGoogleSignIn),
            flows: Arc::new(app::DisabledGoogleSignIn),
            health: store,
            media: Arc::new(MemoryMedia::default()),
            backup: Arc::new(MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
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
            throttle: Throttle::new(),
        });
        Self { clock, services }
    }

    async fn recipe(&self, title: &str, servings: Option<&str>, lines: &[&str]) -> Uuid {
        self.clock.advance(Duration::seconds(1));
        let input = RecipeInput {
            title: title.into(),
            servings: servings.map(Into::into),
            ingredients: lines
                .iter()
                .map(|t| Ingredient {
                    text: (*t).into(),
                    section: None,
                })
                .collect(),
            ..Default::default()
        };
        self.services
            .recipes
            .create(Uuid::new_v4(), input)
            .await
            .unwrap()
            .id
    }

    async fn add(&self, id: Uuid, scale: Option<f64>) -> GroceryListView {
        self.clock.advance(Duration::seconds(1));
        self.services.grocery.add_recipe(id, scale).await.unwrap()
    }
}

fn names(list: &GroceryListView) -> Vec<&str> {
    list.items.iter().map(|i| i.item.name.as_str()).collect()
}

fn item<'a>(list: &'a GroceryListView, name: &str) -> &'a GroceryItemView {
    list.items
        .iter()
        .find(|i| i.item.name == name)
        .unwrap_or_else(|| panic!("no item {name} in {:?}", names(list)))
}

fn amount(min: f64, unit: Option<&str>) -> Amount {
    Amount {
        min,
        max: None,
        unit: unit.map(Into::into),
    }
}

fn is_validation<T: std::fmt::Debug>(r: DomainResult<T>) {
    assert!(matches!(r, Err(DomainError::Validation(_))), "{r:?}");
}

fn is_not_found<T: std::fmt::Debug>(r: DomainResult<T>) {
    assert!(matches!(r, Err(DomainError::NotFound(_))), "{r:?}");
}

#[tokio::test]
async fn an_empty_list_is_made_on_first_use() {
    let w = World::new();
    let list = w.services.grocery.get().await.unwrap();
    assert!(list.recipes.is_empty() && list.items.is_empty());
    assert_eq!(w.services.grocery.get().await.unwrap().id, list.id);
}

#[tokio::test]
async fn two_recipes_sharing_an_ingredient_make_one_line() {
    let w = World::new();
    let a = w.recipe("Soup", None, &["2 onions", "1 cup milk"]).await;
    let b = w.recipe("Stew", None, &["1 onion", "2 cups milk"]).await;
    w.add(a, None).await;
    let list = w.add(b, None).await;
    assert_eq!(names(&list), ["onions", "milk"]);
    let onions = item(&list, "onions");
    assert_eq!(onions.item.amounts, vec![amount(3.0, None)]);
    assert_eq!(onions.item.recipe_ids, vec![a, b]);
    assert_eq!(
        item(&list, "milk").item.amounts,
        vec![amount(3.0, Some("cup"))]
    );
}

#[tokio::test]
async fn units_that_disagree_sit_side_by_side() {
    let w = World::new();
    let a = w.recipe("Bread", None, &["1 cup flour"]).await;
    let b = w.recipe("Pasta", None, &["200 g flour"]).await;
    w.add(a, None).await;
    let list = w.add(b, None).await;
    assert_eq!(list.items.len(), 1);
    assert_eq!(
        list.items[0].item.amounts,
        vec![amount(1.0, Some("cup")), amount(200.0, Some("g"))]
    );
}

#[tokio::test]
async fn items_come_in_shopping_order() {
    let w = World::new();
    let id = w
        .recipe(
            "Everything",
            None,
            &[
                "1 widget",
                "2 cups flour",
                "1 cup frozen peas",
                "1 cup milk",
                "1 lb chicken breast",
                "3 onions",
                "1 apple",
            ],
        )
        .await;
    let list = w.add(id, None).await;
    let order: Vec<(Section, &str)> = list
        .items
        .iter()
        .map(|i| (i.item.section, i.item.name.as_str()))
        .collect();
    assert_eq!(
        order,
        [
            (Section::Produce, "apple"),
            (Section::Produce, "onions"),
            (Section::Meat, "chicken breast"),
            (Section::Fridge, "milk"),
            (Section::Freezer, "frozen peas"),
            (Section::Pantry, "flour"),
            (Section::Other, "widget"),
        ]
    );
}

#[tokio::test]
async fn ticks_survive_another_recipe_unless_it_changes_that_item() {
    let w = World::new();
    let a = w.recipe("Soup", None, &["2 onions", "1 cup milk"]).await;
    let b = w.recipe("Cake", None, &["1 cup flour"]).await;
    let c = w.recipe("Stew", None, &["1 onion"]).await;
    let list = w.add(a, None).await;
    for name in ["onions", "milk"] {
        let id = item(&list, name).item.id;
        w.services
            .grocery
            .update_item(
                id,
                ItemPatch {
                    checked: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    }
    let list = w.add(b, None).await;
    assert!(item(&list, "onions").item.checked && item(&list, "milk").item.checked);
    assert!(!item(&list, "flour").item.checked);

    // Stew adds an onion: you need more onions, the milk is still fine.
    let list = w.add(c, None).await;
    assert!(!item(&list, "onions").item.checked, "you need more");
    assert!(item(&list, "milk").item.checked);
}

#[tokio::test]
async fn rescaling_changes_the_amounts_and_servings() {
    let w = World::new();
    let id = w
        .recipe("Soup", Some("4-6"), &["2 cups stock", "1 onion"])
        .await;
    let list = w.add(id, None).await;
    assert_eq!(list.recipes[0].servings.as_deref(), Some("4–6"));
    assert_eq!(list.recipes[0].scale, 1.0);
    let list = w.add(id, Some(0.5)).await;
    assert_eq!(list.recipes.len(), 1, "adding again sets the scale");
    assert_eq!(list.recipes[0].scale, 0.5);
    assert_eq!(list.recipes[0].servings.as_deref(), Some("2–3"));
    assert_eq!(
        item(&list, "stock").item.amounts,
        vec![amount(1.0, Some("cup"))]
    );
    assert_eq!(item(&list, "onion").item.amounts, vec![amount(0.5, None)]);
}

#[tokio::test]
async fn removing_a_recipe_drops_its_items_but_not_manual_ones() {
    let w = World::new();
    let a = w.recipe("Soup", None, &["2 onions", "1 cup milk"]).await;
    let b = w.recipe("Cake", None, &["1 cup milk", "1 cup flour"]).await;
    w.add(a, None).await;
    w.add(b, None).await;
    w.services
        .grocery
        .add_item("2 lb potatoes", None)
        .await
        .unwrap();
    let list = w.services.grocery.remove_recipe(a).await.unwrap();
    assert_eq!(names(&list), ["potatoes", "milk", "flour"]);
    assert_eq!(
        item(&list, "milk").item.amounts,
        vec![amount(1.0, Some("cup"))]
    );
    assert_eq!(list.recipes.len(), 1);
    is_not_found(w.services.grocery.remove_recipe(a).await);
}

#[tokio::test]
async fn manual_items_survive_recomputes() {
    let w = World::new();
    let manual = w
        .services
        .grocery
        .add_item("  2 lb potatoes ", None)
        .await
        .unwrap();
    assert!(manual.item.manual);
    assert_eq!(manual.item.name, "potatoes");
    assert_eq!(manual.item.section, Section::Produce);
    assert_eq!(manual.item.amounts, vec![amount(2.0, Some("lb"))]);
    w.services
        .grocery
        .update_item(
            manual.item.id,
            ItemPatch {
                checked: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let id = w.recipe("Hash", None, &["3 potatoes"]).await;
    let list = w.add(id, None).await;
    assert_eq!(list.items.len(), 2, "a manual item never merges");
    assert!(
        list.items
            .iter()
            .any(|i| i.item.id == manual.item.id && i.item.checked)
    );
    let list = w.services.grocery.remove_recipe(id).await.unwrap();
    assert_eq!(list.items.len(), 1);
    assert_eq!(list.items[0].item.id, manual.item.id);
}

#[tokio::test]
async fn a_moved_item_is_remembered_for_the_next_list() {
    let w = World::new();
    let id = w.recipe("Salad", None, &["1 avocado", "1 tomato"]).await;
    let list = w.add(id, None).await;
    let avocado = item(&list, "avocado").item.id;
    assert_eq!(item(&list, "avocado").item.section, Section::Produce);

    let moved = w
        .services
        .grocery
        .update_item(
            avocado,
            ItemPatch {
                section: Some(Section::Pantry),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(moved.item.section, Section::Pantry);

    w.services.grocery.clear_all().await.unwrap();
    assert!(w.services.grocery.get().await.unwrap().items.is_empty());
    let list = w.add(id, None).await;
    assert_eq!(
        item(&list, "avocado").item.section,
        Section::Pantry,
        "remembered"
    );
    assert_eq!(item(&list, "tomato").item.section, Section::Produce);

    // A manual item of that name goes there too, and moving a manual item teaches its name.
    let again = w
        .services
        .grocery
        .add_item("2 avocados", None)
        .await
        .unwrap();
    assert_eq!(again.item.section, Section::Pantry);
    let eggs = w.services.grocery.add_item("eggs", None).await.unwrap();
    w.services
        .grocery
        .update_item(
            eggs.item.id,
            ItemPatch {
                section: Some(Section::Other),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let eggs_again = w.services.grocery.add_item("6 eggs", None).await.unwrap();
    assert_eq!(eggs_again.item.section, Section::Other);
    let given = w
        .services
        .grocery
        .add_item("eggs", Some(Section::Meat))
        .await
        .unwrap();
    assert_eq!(
        given.item.section,
        Section::Meat,
        "a section given beats the memory"
    );
}

#[tokio::test]
async fn staples_start_with_salt_and_can_be_changed() {
    let w = World::new();
    let id = w
        .recipe("Plain", None, &["1 tsp salt", "2 cups rice"])
        .await;
    let list = w.add(id, None).await;
    assert!(item(&list, "salt").staple);
    assert!(!item(&list, "rice").staple);
    let rice = item(&list, "rice").item.id;
    let marked = w
        .services
        .grocery
        .update_item(
            rice,
            ItemPatch {
                staple: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(marked.staple);
    let salt = item(&list, "salt").item.id;
    w.services
        .grocery
        .update_item(
            salt,
            ItemPatch {
                staple: Some(false),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let list = w.services.grocery.get().await.unwrap();
    assert!(item(&list, "rice").staple && !item(&list, "salt").staple);
    // Staples are still returned, and survive emptying the list.
    w.services.grocery.clear_all().await.unwrap();
    let list = w.add(id, None).await;
    assert!(item(&list, "rice").staple);
}

#[tokio::test]
async fn clearing_items() {
    let w = World::new();
    let id = w
        .recipe("Soup", None, &["2 onions", "1 cup milk", "1 cup flour"])
        .await;
    let list = w.add(id, None).await;
    let manual = w
        .services
        .grocery
        .add_item("tea", None)
        .await
        .unwrap()
        .item
        .id;
    let (onions, milk) = (item(&list, "onions").item.id, item(&list, "milk").item.id);
    w.services.grocery.clear_item(onions).await.unwrap();
    is_not_found(w.services.grocery.clear_item(onions).await);
    is_not_found(
        w.services
            .grocery
            .update_item(
                onions,
                ItemPatch {
                    checked: Some(true),
                    ..Default::default()
                },
            )
            .await,
    );
    for id in [milk, manual] {
        w.services
            .grocery
            .update_item(
                id,
                ItemPatch {
                    checked: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    }
    let list = w.services.grocery.clear_checked().await.unwrap();
    assert_eq!(names(&list), ["flour"]);
    // A cleared generated item stays off the list through another recompute...
    let other = w.recipe("Toast", None, &["1 slice bread"]).await;
    let list = w.add(other, None).await;
    assert_eq!(names(&list), ["bread", "flour"]);
    // ...and returns when its amounts change.
    w.add(id, Some(2.0)).await;
    let list = w.services.grocery.get().await.unwrap();
    assert_eq!(names(&list), ["onions", "milk", "bread", "flour"]);
    assert_eq!(item(&list, "onions").item.amounts, vec![amount(4.0, None)]);
}

#[tokio::test]
async fn a_deleted_recipe_leaves_the_list_and_comes_back_when_restored() {
    let w = World::new();
    let a = w.recipe("Soup", None, &["2 onions"]).await;
    let b = w.recipe("Cake", None, &["1 cup flour"]).await;
    w.add(a, None).await;
    w.add(b, None).await;
    w.services.recipes.delete(a).await.unwrap();
    let list = w.services.grocery.get().await.unwrap();
    assert_eq!(names(&list), ["flour"]);
    assert_eq!(list.recipes.len(), 1);
    is_not_found(w.services.grocery.add_recipe(a, None).await);
    w.services.recipes.restore(a).await.unwrap();
    let list = w.services.grocery.get().await.unwrap();
    assert_eq!(names(&list), ["onions", "flour"]);
    assert_eq!(list.recipes.len(), 2);
}

#[tokio::test]
async fn updated_at_moves_on_every_write() {
    let w = World::new();
    let id = w.recipe("Soup", None, &["2 onions"]).await;
    let first = w.services.grocery.get().await.unwrap().updated_at;
    let list = w.add(id, None).await;
    assert!(list.updated_at > first);
    w.clock.advance(Duration::seconds(1));
    let manual = w
        .services
        .grocery
        .add_item("tea", None)
        .await
        .unwrap()
        .item
        .id;
    let after_add = w.services.grocery.get().await.unwrap().updated_at;
    assert!(after_add > list.updated_at);
    w.clock.advance(Duration::seconds(1));
    w.services
        .grocery
        .update_item(
            manual,
            ItemPatch {
                checked: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(w.services.grocery.get().await.unwrap().updated_at > after_add);
    // Reading never moves it.
    let read = w.services.grocery.get().await.unwrap().updated_at;
    w.clock.advance(Duration::seconds(1));
    assert_eq!(w.services.grocery.get().await.unwrap().updated_at, read);
}

#[tokio::test]
async fn bad_input_is_refused() {
    let w = World::new();
    let id = w.recipe("Soup", None, &["2 onions"]).await;
    for scale in [0.24, 10.01, 0.0, -1.0, f64::NAN, f64::INFINITY] {
        is_validation(w.services.grocery.add_recipe(id, Some(scale)).await);
    }
    for scale in [0.25, 10.0] {
        w.services
            .grocery
            .add_recipe(id, Some(scale))
            .await
            .unwrap();
    }
    is_not_found(w.services.grocery.add_recipe(Uuid::new_v4(), None).await);
    is_not_found(w.services.grocery.remove_recipe(Uuid::new_v4()).await);

    for text in ["", "   ", &"x".repeat(201)] {
        is_validation(w.services.grocery.add_item(text, None).await);
    }
    w.services
        .grocery
        .add_item(&"x".repeat(200), None)
        .await
        .unwrap();
    w.services
        .grocery
        .add_item(&format!(" {} ", "é".repeat(200)), None)
        .await
        .unwrap();

    let tea = w
        .services
        .grocery
        .add_item("tea", None)
        .await
        .unwrap()
        .item
        .id;
    is_validation(
        w.services
            .grocery
            .update_item(tea, ItemPatch::default())
            .await,
    );
    is_not_found(
        w.services
            .grocery
            .update_item(
                Uuid::new_v4(),
                ItemPatch {
                    checked: Some(true),
                    ..Default::default()
                },
            )
            .await,
    );
    is_not_found(w.services.grocery.clear_item(Uuid::new_v4()).await);
}

#[tokio::test]
async fn an_edited_recipe_reaches_the_list_on_the_next_read() {
    let w = World::new();
    let id = w.recipe("Soup", None, &["2 onions", "1 cup milk"]).await;
    let list = w.add(id, None).await;
    let onions = item(&list, "onions").item.id;
    w.services
        .grocery
        .update_item(
            onions,
            ItemPatch {
                checked: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let before = w.services.grocery.get().await.unwrap();

    // Nothing changed: reading writes nothing, so `updated_at` stays.
    w.clock.advance(Duration::seconds(1));
    let again = w.services.grocery.get().await.unwrap();
    assert_eq!(again, before);

    // Edit the recipe: a new line appears, the milk total changes, the untouched onions keep their tick.
    w.clock.advance(Duration::seconds(1));
    let input = RecipeInput {
        title: "Soup".into(),
        ingredients: ["2 onions", "2 cups milk", "1 tbsp paprika"]
            .iter()
            .map(|t| Ingredient {
                text: (*t).into(),
                section: None,
            })
            .collect(),
        ..Default::default()
    };
    w.services
        .recipes
        .update(id, Uuid::new_v4(), input)
        .await
        .unwrap();
    let after = w.services.grocery.get().await.unwrap();
    assert_eq!(names(&after), ["onions", "milk", "paprika"]);
    assert!(after.updated_at > before.updated_at);
    assert_eq!(
        item(&after, "milk").item.amounts,
        vec![amount(2.0, Some("cup"))]
    );
    let onions = item(&after, "onions");
    assert!(onions.item.checked && onions.item.id == before.items[0].item.id);

    // And reading again is quiet again.
    w.clock.advance(Duration::seconds(1));
    assert_eq!(w.services.grocery.get().await.unwrap(), after);
}

#[tokio::test]
async fn reading_a_fully_cleared_list_writes_nothing() {
    let w = World::new();
    let id = w.recipe("Soup", None, &["2 onions"]).await;
    let list = w.add(id, None).await;
    w.services
        .grocery
        .update_item(
            list.items[0].item.id,
            ItemPatch {
                checked: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let cleared = w.services.grocery.clear_checked().await.unwrap();
    assert!(cleared.items.is_empty());
    w.clock.advance(Duration::seconds(1));
    assert_eq!(w.services.grocery.get().await.unwrap(), cleared);
}

#[tokio::test]
async fn nul_characters_are_dropped_from_manual_text() {
    let w = World::new();
    is_validation(w.services.grocery.add_item("\0", None).await);
    is_validation(w.services.grocery.add_item(" \0 \0", None).await);
    let item = w.services.grocery.add_item("a\0b", None).await.unwrap();
    assert_eq!(item.item.name, "ab");
}

#[tokio::test]
async fn a_patch_with_several_fields_applies_them_together() {
    let w = World::new();
    let tea = w.services.grocery.add_item("tea", None).await.unwrap();
    let patched = w
        .services
        .grocery
        .update_item(
            tea.item.id,
            ItemPatch {
                checked: Some(true),
                section: Some(Section::Fridge),
                staple: Some(true),
            },
        )
        .await
        .unwrap();
    assert!(patched.item.checked && patched.staple);
    assert_eq!(patched.item.section, Section::Fridge);
}
