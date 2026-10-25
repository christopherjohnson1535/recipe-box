//! Cases for the grocery repository.

use std::{collections::HashMap, sync::Arc, sync::Mutex};

use domain::{
    DomainError, RecipeInput,
    chrono::Duration,
    grocery::{Amount, GeneratedItem, Section},
    uuid::Uuid,
};

use super::{Ctx, Stack, accounts::join2, ms};
use crate::{Clock, GroceryItem, GroceryList, ListedRecipe, NewGroceryItem};

pub async fn grocery_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    one_list_and_its_recipes(&make).await;
    deleted_recipes_leave_the_list(&make).await;
    recompute_creates_updates_and_deletes(&make).await;
    recompute_keeps_ticks_until_amounts_change(&make).await;
    recompute_sees_recipes_and_overrides(&make).await;
    concurrent_recomputes_each_see_every_recipe(&make).await;
    manual_items(&make).await;
    clearing_items(&make).await;
    sections_are_remembered(&make).await;
    clearing_everything_keeps_the_household_choices(&make).await;
    staples(&make).await;
}

fn amount(min: f64, unit: Option<&str>) -> Amount {
    Amount {
        min,
        max: None,
        unit: unit.map(Into::into),
    }
}

fn computed(key: &str, amounts: Vec<Amount>, section: Section) -> GeneratedItem {
    GeneratedItem {
        key: key.into(),
        name: key.into(),
        amounts,
        section,
        recipe_ids: vec![],
    }
}

/// Makes the generated items exactly `items`.
async fn set_generated(c: &Ctx, list: &GroceryList, items: Vec<GeneratedItem>) {
    c.s.grocery
        .recompute(list.id, &move |_, _| items.clone())
        .await
        .unwrap();
}

async fn visible(c: &Ctx, list: &GroceryList) -> Vec<GroceryItem> {
    let mut items = c.s.grocery.items(list.id).await.unwrap();
    items.sort_by(|a, b| a.key.cmp(&b.key).then(a.manual.cmp(&b.manual)));
    items
}

async fn one(c: &Ctx, list: &GroceryList, key: &str) -> GroceryItem {
    visible(c, list)
        .await
        .into_iter()
        .find(|i| i.key == key)
        .unwrap_or_else(|| panic!("no visible item {key}"))
}

async fn keys(c: &Ctx, list: &GroceryList) -> Vec<String> {
    visible(c, list).await.into_iter().map(|i| i.key).collect()
}

async fn updated_at(c: &Ctx) -> domain::chrono::DateTime<domain::chrono::Utc> {
    c.s.grocery.get_or_create_list().await.unwrap().updated_at
}

async fn one_list_and_its_recipes<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    assert_eq!(list.updated_at, super::epoch());
    let (a, b) = join2(
        c.s.grocery.get_or_create_list(),
        c.s.grocery.get_or_create_list(),
    )
    .await;
    assert_eq!(
        (a.unwrap().id, b.unwrap().id),
        (list.id, list.id),
        "one list"
    );
    assert!(c.s.grocery.recipes(list.id).await.unwrap().is_empty());
    assert!(c.s.grocery.items(list.id).await.unwrap().is_empty());

    let soup =
        c.s.recipes
            .create(
                c.user,
                RecipeInput {
                    title: "Soup".into(),
                    servings: Some("4".into()),
                    ingredients: vec![domain::Ingredient {
                        text: "2 onions".into(),
                        section: None,
                    }],
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    let stew = c.add("Stew", &["1 lb beef"], None, &[]).await;

    c.clock.advance(Duration::seconds(1));
    c.s.grocery.add_recipe(list.id, stew, 2.0).await.unwrap();
    assert_eq!(
        updated_at(&c).await,
        c.clock.now(),
        "a write moves updated_at"
    );
    c.clock.advance(Duration::seconds(1));
    c.s.grocery.add_recipe(list.id, soup.id, 1.0).await.unwrap();
    let on_list = c.s.grocery.recipes(list.id).await.unwrap();
    assert_eq!(
        on_list,
        vec![
            ListedRecipe {
                recipe_id: stew,
                scale: 2.0,
                title: "Stew".into(),
                servings: None,
                image_file: None,
                ingredients: vec![domain::Ingredient {
                    text: "1 lb beef".into(),
                    section: None,
                }],
            },
            ListedRecipe {
                recipe_id: soup.id,
                scale: 1.0,
                title: "Soup".into(),
                servings: Some("4".into()),
                image_file: None,
                ingredients: soup.ingredients.clone(),
            },
        ],
        "in the order they were added"
    );

    // Adding again sets the scale and keeps the place.
    c.clock.advance(Duration::seconds(1));
    c.s.grocery.add_recipe(list.id, stew, 0.5).await.unwrap();
    let on_list = c.s.grocery.recipes(list.id).await.unwrap();
    assert_eq!(
        on_list
            .iter()
            .map(|r| (r.recipe_id, r.scale))
            .collect::<Vec<_>>(),
        vec![(stew, 0.5), (soup.id, 1.0)]
    );

    let unknown = c.s.grocery.add_recipe(list.id, Uuid::new_v4(), 1.0).await;
    assert!(
        matches!(unknown, Err(DomainError::NotFound(_))),
        "{unknown:?}"
    );
    let unlisted = c.s.grocery.remove_recipe(list.id, Uuid::new_v4()).await;
    assert!(
        matches!(unlisted, Err(DomainError::NotFound(_))),
        "{unlisted:?}"
    );

    c.clock.advance(Duration::seconds(1));
    c.s.grocery.remove_recipe(list.id, stew).await.unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    let left = c.s.grocery.recipes(list.id).await.unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].recipe_id, soup.id);
}

async fn deleted_recipes_leave_the_list<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let kept = c.add("Kept", &["1 egg"], None, &[]).await;
    let gone = c.add("Gone", &["1 egg"], None, &[]).await;
    c.s.grocery.add_recipe(list.id, kept, 1.0).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    c.s.grocery.add_recipe(list.id, gone, 3.0).await.unwrap();

    c.s.recipes.soft_delete(gone).await.unwrap();
    let ids = |rs: Vec<ListedRecipe>| rs.into_iter().map(|r| r.recipe_id).collect::<Vec<_>>();
    assert_eq!(ids(c.s.grocery.recipes(list.id).await.unwrap()), vec![kept]);
    let again = c.s.grocery.add_recipe(list.id, gone, 1.0).await;
    assert!(matches!(again, Err(DomainError::NotFound(_))), "{again:?}");

    // Restored within the window: back on the list, at its scale.
    c.s.recipes.restore(gone).await.unwrap();
    let back = c.s.grocery.recipes(list.id).await.unwrap();
    assert_eq!(
        back.iter()
            .map(|r| (r.recipe_id, r.scale))
            .collect::<Vec<_>>(),
        vec![(kept, 1.0), (gone, 3.0)]
    );

    // Purged for good: the row goes with the recipe.
    c.s.recipes.soft_delete(gone).await.unwrap();
    c.clock.advance(domain::PURGE_AFTER + ms(1));
    let cutoff = c.clock.now() - domain::PURGE_AFTER;
    assert_eq!(c.s.recipes.purge_deleted_before(cutoff).await.unwrap(), 1);
    assert_eq!(ids(c.s.grocery.recipes(list.id).await.unwrap()), vec![kept]);
    let removed = c.s.grocery.remove_recipe(list.id, gone).await;
    assert!(
        matches!(removed, Err(DomainError::NotFound(_))),
        "{removed:?}"
    );
}

async fn recompute_creates_updates_and_deletes<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let r1 = Uuid::new_v4();
    let mut onion = computed("onion", vec![amount(2.0, None)], Section::Produce);
    onion.name = "onions".into();
    onion.recipe_ids = vec![r1];
    c.clock.advance(Duration::seconds(1));
    set_generated(
        &c,
        &list,
        vec![
            onion.clone(),
            computed("milk", vec![amount(1.0, Some("cup"))], Section::Fridge),
            computed("salt", vec![], Section::Pantry),
        ],
    )
    .await;
    assert_eq!(updated_at(&c).await, c.clock.now());
    let got = visible(&c, &list).await;
    assert_eq!(keys(&c, &list).await, ["milk", "onion", "salt"]);
    let o = &got[1];
    assert_eq!(
        (
            o.name.as_str(),
            &o.amounts,
            o.section,
            o.checked,
            o.manual,
            &o.recipe_ids
        ),
        (
            "onions",
            &onion.amounts,
            Section::Produce,
            false,
            false,
            &vec![r1]
        )
    );

    // Same set again: nothing changes, so nothing moves.
    let stamp = updated_at(&c).await;
    c.clock.advance(Duration::seconds(1));
    let ids: Vec<Uuid> = got.iter().map(|i| i.id).collect();
    set_generated(
        &c,
        &list,
        vec![
            onion.clone(),
            computed("milk", vec![amount(1.0, Some("cup"))], Section::Fridge),
            computed("salt", vec![], Section::Pantry),
        ],
    )
    .await;
    assert_eq!(
        updated_at(&c).await,
        stamp,
        "a recompute that changes nothing is not a write"
    );
    assert_eq!(
        visible(&c, &list)
            .await
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>(),
        ids,
        "items keep their ids"
    );

    // A key that is no longer computed goes; the others stay.
    set_generated(&c, &list, vec![onion]).await;
    assert_eq!(keys(&c, &list).await, ["onion"]);
    assert_eq!(updated_at(&c).await, c.clock.now());
    set_generated(&c, &list, vec![]).await;
    assert!(keys(&c, &list).await.is_empty());
}

async fn recompute_keeps_ticks_until_amounts_change<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let eggs = |n| computed("egg", vec![amount(n, None)], Section::Fridge);
    let flour = |n| computed("flour", vec![amount(n, Some("cup"))], Section::Pantry);
    set_generated(&c, &list, vec![eggs(2.0), flour(1.0)]).await;
    let egg = one(&c, &list, "egg").await;
    let flour_id = one(&c, &list, "flour").await.id;
    c.s.grocery.set_checked(egg.id, true).await.unwrap();
    c.s.grocery.set_checked(flour_id, true).await.unwrap();

    // Same amounts: ticks stay, even when the name, section or recipes change.
    let mut moved = eggs(2.0);
    moved.section = Section::Other;
    moved.name = "eggs".into();
    moved.recipe_ids = vec![Uuid::new_v4()];
    set_generated(&c, &list, vec![moved.clone(), flour(1.0)]).await;
    let got = one(&c, &list, "egg").await;
    assert!(got.checked, "ticked stays ticked");
    assert_eq!(got.id, egg.id);
    assert_eq!(
        (got.name.as_str(), got.section, &got.recipe_ids),
        ("eggs", Section::Other, &moved.recipe_ids)
    );

    // More eggs: egg is un-ticked, flour is untouched.
    set_generated(&c, &list, vec![eggs(3.0), flour(1.0)]).await;
    assert!(!one(&c, &list, "egg").await.checked, "you need more");
    assert!(one(&c, &list, "flour").await.checked);

    // A cleared item stays gone while its amounts stay, and comes back un-ticked when they change.
    c.s.grocery.clear_item(flour_id).await.unwrap();
    set_generated(&c, &list, vec![eggs(3.0), flour(1.0)]).await;
    assert_eq!(keys(&c, &list).await, ["egg"]);
    set_generated(&c, &list, vec![eggs(3.0), flour(2.0)]).await;
    let back = one(&c, &list, "flour").await;
    assert_eq!((back.id, back.checked), (flour_id, false));
    assert_eq!(back.amounts, vec![amount(2.0, Some("cup"))]);

    // Floats that have no short decimal form survive storage: nothing changes, so the tick stays.
    let third = || {
        computed(
            "rice",
            vec![amount(0.1 + 0.2, Some("cup"))],
            Section::Pantry,
        )
    };
    set_generated(&c, &list, vec![eggs(3.0), flour(2.0), third()]).await;
    let rice = one(&c, &list, "rice").await.id;
    c.s.grocery.set_checked(rice, true).await.unwrap();
    set_generated(&c, &list, vec![eggs(3.0), flour(2.0), third()]).await;
    assert!(one(&c, &list, "rice").await.checked);
    set_generated(&c, &list, vec![eggs(3.0), flour(2.0)]).await;

    // A different unit is a change too; so is going from an amount to none.
    c.s.grocery.set_checked(flour_id, true).await.unwrap();
    set_generated(
        &c,
        &list,
        vec![
            eggs(3.0),
            computed("flour", vec![amount(2.0, Some("g"))], Section::Pantry),
        ],
    )
    .await;
    assert!(!one(&c, &list, "flour").await.checked);
}

async fn recompute_sees_recipes_and_overrides<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let id = c.add("Pie", &["2 apples"], None, &[]).await;
    c.s.grocery.add_recipe(list.id, id, 1.5).await.unwrap();
    c.s.grocery
        .set_section(list.id, "apple", Section::Fridge)
        .await
        .unwrap();
    type Seen = Option<(Vec<ListedRecipe>, HashMap<String, Section>)>;
    let seen: Arc<Mutex<Seen>> = Arc::default();
    let sink = seen.clone();
    c.s.grocery
        .recompute(list.id, &move |recipes, overrides| {
            *sink.lock().unwrap() = Some((recipes.to_vec(), overrides.clone()));
            vec![]
        })
        .await
        .unwrap();
    let (recipes, overrides) = seen.lock().unwrap().take().expect("compute ran");
    assert_eq!(
        recipes
            .iter()
            .map(|r| (r.recipe_id, r.scale))
            .collect::<Vec<_>>(),
        vec![(id, 1.5)]
    );
    assert_eq!(recipes[0].ingredients[0].text, "2 apples");
    assert_eq!(
        overrides,
        HashMap::from([("apple".to_string(), Section::Fridge)])
    );

    let missing = c.s.grocery.recompute(Uuid::new_v4(), &|_, _| vec![]).await;
    assert!(
        matches!(missing, Err(DomainError::NotFound(_))),
        "{missing:?}"
    );
}

/// Two overlapping "add a recipe, then recompute" flows: whichever recompute runs last has read both recipes.
async fn concurrent_recomputes_each_see_every_recipe<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let a = c.add("A", &["1 apple"], None, &[]).await;
    let b = c.add("B", &["1 pear"], None, &[]).await;
    let flow = |id: Uuid| {
        let (grocery, list_id) = (c.s.grocery.clone(), list.id);
        async move {
            grocery.add_recipe(list_id, id, 1.0).await.unwrap();
            grocery
                .recompute(list_id, &|recipes, _| {
                    recipes
                        .iter()
                        .map(|r| {
                            let key = r.ingredients[0].text.trim_start_matches("1 ").to_string();
                            computed(&key, vec![], Section::Other)
                        })
                        .collect()
                })
                .await
                .unwrap();
        }
    };
    join2(flow(a), flow(b)).await;
    assert_eq!(keys(&c, &list).await, ["apple", "pear"]);
}

async fn manual_items<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    c.clock.advance(Duration::seconds(1));
    let new = |text: &str| NewGroceryItem {
        key: text.into(),
        name: text.into(),
        amounts: vec![amount(2.0, Some("lb"))],
        section: Section::Produce,
    };
    let potatoes =
        c.s.grocery
            .add_manual(list.id, new("potato"))
            .await
            .unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    assert!(potatoes.manual && !potatoes.checked && potatoes.recipe_ids.is_empty());
    assert_eq!(
        c.s.grocery.item(potatoes.id).await.unwrap(),
        Some(potatoes.clone())
    );
    assert_eq!(c.s.grocery.item(Uuid::new_v4()).await.unwrap(), None);

    // The same name twice is two items; a generated item of that name sits beside them.
    let second =
        c.s.grocery
            .add_manual(list.id, new("potato"))
            .await
            .unwrap();
    assert_ne!(second.id, potatoes.id);
    set_generated(
        &c,
        &list,
        vec![computed("potato", vec![], Section::Produce)],
    )
    .await;
    assert_eq!(visible(&c, &list).await.len(), 3);

    c.clock.advance(Duration::seconds(1));
    c.s.grocery.set_checked(potatoes.id, true).await.unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    assert!(
        c.s.grocery
            .item(potatoes.id)
            .await
            .unwrap()
            .unwrap()
            .checked
    );
    c.s.grocery.set_checked(potatoes.id, false).await.unwrap();
    assert!(
        !c.s.grocery
            .item(potatoes.id)
            .await
            .unwrap()
            .unwrap()
            .checked
    );
    let unknown = c.s.grocery.set_checked(Uuid::new_v4(), true).await;
    assert!(
        matches!(unknown, Err(DomainError::NotFound(_))),
        "{unknown:?}"
    );

    // Recomputing leaves manual items alone, even when nothing is computed.
    c.s.grocery.set_checked(second.id, true).await.unwrap();
    set_generated(&c, &list, vec![]).await;
    let left = visible(&c, &list).await;
    assert_eq!(left.len(), 2);
    assert!(left.iter().all(|i| i.manual));
    assert!(c.s.grocery.item(second.id).await.unwrap().unwrap().checked);
}

async fn clearing_items<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let new = |key: &str| NewGroceryItem {
        key: key.into(),
        name: key.into(),
        amounts: vec![],
        section: Section::Other,
    };
    let m1 = c.s.grocery.add_manual(list.id, new("m1")).await.unwrap().id;
    let m2 = c.s.grocery.add_manual(list.id, new("m2")).await.unwrap().id;
    let m3 = c.s.grocery.add_manual(list.id, new("m3")).await.unwrap().id;
    let gen_items = vec![
        computed("g1", vec![amount(1.0, None)], Section::Other),
        computed("g2", vec![amount(1.0, None)], Section::Other),
        computed("g3", vec![amount(1.0, None)], Section::Other),
    ];
    set_generated(&c, &list, gen_items.clone()).await;
    let (g1, g2, g3) = (
        one(&c, &list, "g1").await.id,
        one(&c, &list, "g2").await.id,
        one(&c, &list, "g3").await.id,
    );

    // One item: a manual one is deleted, a generated one is hidden; a second clear finds nothing.
    c.clock.advance(Duration::seconds(1));
    c.s.grocery.clear_item(m1).await.unwrap();
    c.s.grocery.clear_item(g1).await.unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    assert_eq!(keys(&c, &list).await, ["g2", "g3", "m2", "m3"]);
    for id in [m1, g1, Uuid::new_v4()] {
        let again = c.s.grocery.clear_item(id).await;
        assert!(matches!(again, Err(DomainError::NotFound(_))), "{again:?}");
    }
    assert_eq!(
        c.s.grocery.item(g1).await.unwrap(),
        None,
        "a cleared item is invisible"
    );
    let ticked = c.s.grocery.set_checked(g1, true).await;
    assert!(
        matches!(ticked, Err(DomainError::NotFound(_))),
        "{ticked:?}"
    );
    set_generated(&c, &list, gen_items.clone()).await;
    assert_eq!(
        keys(&c, &list).await,
        ["g2", "g3", "m2", "m3"],
        "a recompute does not bring it back"
    );

    // Every ticked item at once.
    for id in [m2, g2] {
        c.s.grocery.set_checked(id, true).await.unwrap();
    }
    c.clock.advance(Duration::seconds(1));
    c.s.grocery.clear_checked(list.id).await.unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    assert_eq!(keys(&c, &list).await, ["g3", "m3"]);
    assert_eq!(
        (g3, m3),
        (one(&c, &list, "g3").await.id, one(&c, &list, "m3").await.id)
    );
    set_generated(&c, &list, gen_items).await;
    assert_eq!(
        keys(&c, &list).await,
        ["g3", "m3"],
        "cleared generated items stay hidden"
    );
}

async fn sections_are_remembered<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    assert!(c.s.grocery.overrides().await.unwrap().is_empty());
    let manual =
        c.s.grocery
            .add_manual(
                list.id,
                NewGroceryItem {
                    key: "tofu".into(),
                    name: "tofu".into(),
                    amounts: vec![],
                    section: Section::Other,
                },
            )
            .await
            .unwrap();
    set_generated(
        &c,
        &list,
        vec![
            computed("tofu", vec![], Section::Other),
            computed("rice", vec![], Section::Pantry),
        ],
    )
    .await;

    c.clock.advance(Duration::seconds(1));
    c.s.grocery
        .set_section(list.id, "tofu", Section::Fridge)
        .await
        .unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    let tofu: Vec<_> = visible(&c, &list)
        .await
        .into_iter()
        .filter(|i| i.key == "tofu")
        .collect();
    assert_eq!(tofu.len(), 2, "manual and generated");
    assert!(tofu.iter().all(|i| i.section == Section::Fridge));
    assert_eq!(one(&c, &list, "rice").await.section, Section::Pantry);
    assert_eq!(
        c.s.grocery.item(manual.id).await.unwrap().unwrap().section,
        Section::Fridge
    );

    c.s.grocery
        .set_section(list.id, "tofu", Section::Freezer)
        .await
        .unwrap();
    c.s.grocery
        .set_section(list.id, "kale", Section::Produce)
        .await
        .unwrap();
    assert_eq!(
        c.s.grocery.overrides().await.unwrap(),
        HashMap::from([
            ("tofu".to_string(), Section::Freezer),
            ("kale".to_string(), Section::Produce)
        ])
    );
}

async fn clearing_everything_keeps_the_household_choices<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let id = c.add("Salad", &["1 kale"], None, &[]).await;
    c.s.grocery.add_recipe(list.id, id, 1.0).await.unwrap();
    set_generated(&c, &list, vec![computed("kale", vec![], Section::Other)]).await;
    c.s.grocery
        .add_manual(
            list.id,
            NewGroceryItem {
                key: "tea".into(),
                name: "tea".into(),
                amounts: vec![],
                section: Section::Pantry,
            },
        )
        .await
        .unwrap();
    c.s.grocery
        .set_section(list.id, "kale", Section::Produce)
        .await
        .unwrap();
    c.s.grocery.set_staple(list.id, "kale", true).await.unwrap();
    let hidden = one(&c, &list, "kale").await.id;
    c.s.grocery.clear_item(hidden).await.unwrap();

    c.clock.advance(Duration::seconds(1));
    c.s.grocery.clear_all(list.id).await.unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    assert!(c.s.grocery.recipes(list.id).await.unwrap().is_empty());
    assert!(c.s.grocery.items(list.id).await.unwrap().is_empty());
    assert_eq!(
        c.s.grocery.overrides().await.unwrap(),
        HashMap::from([("kale".to_string(), Section::Produce)])
    );
    assert!(c.s.grocery.staples().await.unwrap().contains("kale"));
    assert_eq!(c.s.grocery.get_or_create_list().await.unwrap().id, list.id);

    // The cleared item is gone for good, so it is back when something computes it again.
    set_generated(&c, &list, vec![computed("kale", vec![], Section::Produce)]).await;
    assert_eq!(keys(&c, &list).await, ["kale"]);
}

async fn staples<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let list = c.s.grocery.get_or_create_list().await.unwrap();
    let mut start: Vec<String> = c.s.grocery.staples().await.unwrap().into_iter().collect();
    start.sort();
    assert_eq!(start, ["black pepper", "pepper", "salt", "water"]);

    c.clock.advance(Duration::seconds(1));
    c.s.grocery
        .set_staple(list.id, "flour", true)
        .await
        .unwrap();
    assert_eq!(updated_at(&c).await, c.clock.now());
    c.s.grocery
        .set_staple(list.id, "flour", true)
        .await
        .unwrap();
    c.s.grocery
        .set_staple(list.id, "salt", false)
        .await
        .unwrap();
    c.s.grocery
        .set_staple(list.id, "never marked", false)
        .await
        .unwrap();
    let mut now: Vec<String> = c.s.grocery.staples().await.unwrap().into_iter().collect();
    now.sort();
    assert_eq!(now, ["black pepper", "flour", "pepper", "water"]);
}
