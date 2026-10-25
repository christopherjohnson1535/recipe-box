//! `RecipeRepo` cases: CRUD, search (from `backend/tests/search.rs`), restore and purge (from `time_rules.rs`).

use std::sync::Arc;

use domain::{
    DomainError, Image, Ingredient, PURGE_AFTER, RESTORE_WINDOW_MINUTES, RecipeInput, SearchQuery,
    Sort, SourceType, chrono::Duration, uuid::Uuid,
};

use super::{Capabilities, Ctx, Stack, ms, skip};
use crate::Clock;

/// Runs every `RecipeRepo` case against a fresh stack each.
pub async fn recipe_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F, caps: Capabilities) {
    create_and_get(&make).await;
    update_replaces_everything(&make).await;
    unknown_images_are_refused(&make).await;
    create_many_is_all_or_nothing(&make).await;
    delete_hides_the_recipe(&make).await;
    deleting_stamps_the_clock(&make).await;
    live_source_urls_prefilter(&make).await;
    restore_window_edges(&make).await;
    purge_edges(&make).await;
    ingredient_and_title_matches(&make).await;
    websearch_syntax(&make, caps).await;
    tag_and_query_combine(&make).await;
    tag_names_are_searched(&make).await;
    sorts_and_total(&make).await;
    relevance_prefers_title_hits(&make).await;
    soft_deleted_are_excluded(&make).await;
    special_characters_are_literal_and_safe(&make).await;
    counts_over_many_recipes(&make).await;
}

fn line(text: &str, section: Option<&str>) -> Ingredient {
    Ingredient {
        text: text.into(),
        section: section.map(Into::into),
    }
}

fn image(name: &str) -> Image {
    Image {
        id: Uuid::new_v4(),
        file_name: name.into(),
        display_file_name: None,
        width: 640,
        height: 480,
        bytes: 1000,
        created_by: None,
    }
}

impl Ctx {
    async fn find(&self, text: &str) -> Vec<String> {
        self.query(SearchQuery {
            text: Some(text.into()),
            ..Default::default()
        })
        .await
        .0
    }

    /// Titles in result order, and the total.
    async fn query(&self, q: SearchQuery) -> (Vec<String>, i64) {
        let page = self.s.recipes.search(q).await.expect("search");
        (
            page.items.into_iter().map(|i| i.title).collect(),
            page.total,
        )
    }

    async fn find_sorted(&self, text: &str) -> Vec<String> {
        let mut hits = self.find(text).await;
        hits.sort();
        hits
    }

    async fn find_in(&self, text: &str, tag: &str) -> (Vec<String>, i64) {
        self.query(SearchQuery {
            text: Some(text.into()),
            tag: Some(tag.into()),
            ..Default::default()
        })
        .await
    }

    /// `find` with an optional tag and room for every recipe.
    async fn count(&self, text: &str, tag: Option<&str>) -> (Vec<String>, i64) {
        self.query(SearchQuery {
            text: Some(text.into()),
            tag: tag.map(Into::into),
            limit: 200,
            ..Default::default()
        })
        .await
    }

    async fn all(&self, sort: Sort) -> Vec<String> {
        self.query(SearchQuery {
            sort,
            ..Default::default()
        })
        .await
        .0
    }

    async fn seed(&self) {
        self.add(
            "Weeknight lasagne",
            &["500g beef mince", "1 cup buttermilk"],
            Some(90),
            &["dinner", "pasta"],
        )
        .await;
        self.add(
            "Buttermilk pancakes",
            &["2 cups flour", "1 cup buttermilk"],
            Some(20),
            &["breakfast"],
        )
        .await;
        self.add("Tomato soup", &["6 tomatoes", "1 onion"], None, &["dinner"])
            .await;
        self.add("Apple crumble", &["apples", "oats"], Some(45), &["dessert"])
            .await;
    }

    fn input(title: &str) -> RecipeInput {
        RecipeInput {
            title: title.into(),
            ..Default::default()
        }
    }
}

async fn create_and_get<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let (main, a, b) = (image("main.jpg"), image("a.jpg"), image("b.jpg"));
    let ids = (main.id, a.id, b.id);
    for i in [main, a, b] {
        c.s.images.add(i).await.unwrap();
    }
    c.clock.advance(Duration::hours(1));
    let created =
        c.s.recipes
            .create(
                c.user,
                RecipeInput {
                    title: "Soup".into(),
                    description: "Warm".into(),
                    ingredients: vec![line("1 onion", Some("Base")), line("2 cups stock", None)],
                    steps: vec![line("Chop", None), line("Simmer", Some("Cook"))],
                    servings: Some("4".into()),
                    prep_minutes: Some(5),
                    cook_minutes: Some(25),
                    total_minutes: Some(30),
                    notes: "Better next day".into(),
                    source_url: Some("https://example.com/soup".into()),
                    source_name: Some("Example".into()),
                    source_type: SourceType::Link,
                    image_id: Some(ids.0),
                    photo_image_ids: vec![ids.2, ids.1],
                    tags: vec!["pasta".into(), "dinner".into()],
                },
            )
            .await
            .unwrap();
    assert_eq!(created.created_at, c.clock.now(), "stamped by the clock");
    assert_eq!(created.updated_at, created.created_at);
    let got =
        c.s.recipes
            .get(created.id)
            .await
            .unwrap()
            .expect("saved recipe is found");
    assert_eq!(got.id, created.id);
    assert_eq!(got.title, "Soup");
    assert_eq!(got.description, "Warm");
    assert_eq!(
        got.ingredients,
        vec![line("1 onion", Some("Base")), line("2 cups stock", None)]
    );
    assert_eq!(
        got.steps,
        vec![line("Chop", None), line("Simmer", Some("Cook"))]
    );
    assert_eq!(
        (
            got.servings.as_deref(),
            got.prep_minutes,
            got.cook_minutes,
            got.total_minutes
        ),
        (Some("4"), Some(5), Some(25), Some(30))
    );
    assert_eq!(got.notes, "Better next day");
    assert_eq!(
        (
            got.source_url.as_deref(),
            got.source_name.as_deref(),
            got.source_type
        ),
        (
            Some("https://example.com/soup"),
            Some("Example"),
            SourceType::Link
        )
    );
    assert_eq!(
        got.tags,
        ["dinner", "pasta"],
        "tags come back sorted by name"
    );
    assert_eq!(got.image_id, Some(ids.0));
    assert_eq!(got.image_file.as_deref(), Some("main.jpg"));
    assert_eq!(got.image_display_file, None);
    assert_eq!(
        got.photo_image_ids,
        [ids.2, ids.1],
        "photos keep their order"
    );
    assert_eq!(got.photo_files, ["b.jpg", "a.jpg"]);
    let by = got.created_by.expect("creator is named");
    assert_eq!((by.id, by.display_name.as_str()), (c.user, "Tester"));
    assert_eq!(got.updated_by, Some(by));

    // The rendition shows up once it exists.
    assert!(
        c.s.images
            .set_display_file(ids.0, "main.display.jpg")
            .await
            .unwrap()
    );
    let got = c.s.recipes.get(created.id).await.unwrap().unwrap();
    assert_eq!(got.image_display_file.as_deref(), Some("main.display.jpg"));

    assert!(c.s.recipes.get(Uuid::new_v4()).await.unwrap().is_none());
}

async fn update_replaces_everything<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let photo = image("p.jpg");
    let photo_id = photo.id;
    c.s.images.add(photo).await.unwrap();
    let other =
        c.s.users
            .create(super::new_user("other", "Other", "member"))
            .await
            .unwrap();
    let first =
        c.s.recipes
            .create(
                c.user,
                RecipeInput {
                    title: "Before".into(),
                    notes: "old".into(),
                    tags: vec!["old".into(), "keep".into()],
                    photo_image_ids: vec![photo_id],
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    c.clock.advance(Duration::minutes(5));
    let updated =
        c.s.recipes
            .update(
                first.id,
                other.id,
                RecipeInput {
                    title: "After".into(),
                    tags: vec!["keep".into(), "new".into()],
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    assert_eq!(updated.title, "After");
    assert_eq!(updated.notes, "", "a full replace, not a patch");
    assert_eq!(updated.tags, ["keep", "new"]);
    assert!(updated.photo_image_ids.is_empty() && updated.photo_files.is_empty());
    assert_eq!(updated.created_at, first.created_at);
    assert_eq!(updated.updated_at, c.clock.now());
    assert_eq!(updated.created_by.map(|u| u.id), Some(c.user));
    assert_eq!(
        updated.updated_by.map(|u| u.display_name),
        Some("Other".into())
    );
    let tags: Vec<String> =
        c.s.tags
            .list_in_use()
            .await
            .unwrap()
            .into_iter()
            .map(|t| t.name)
            .collect();
    assert_eq!(tags, ["keep", "new"], "the dropped tag is gone");

    let missing =
        c.s.recipes
            .update(Uuid::new_v4(), c.user, Ctx::input("x"))
            .await;
    assert!(matches!(missing, Err(DomainError::NotFound(_))));
    c.s.recipes.soft_delete(first.id).await.unwrap();
    let deleted = c.s.recipes.update(first.id, c.user, Ctx::input("x")).await;
    assert!(
        matches!(deleted, Err(DomainError::NotFound(_))),
        "a deleted recipe is not updated"
    );
}

async fn unknown_images_are_refused<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    for (main, photos) in [(Some(Uuid::new_v4()), vec![]), (None, vec![Uuid::new_v4()])] {
        let input = || RecipeInput {
            title: "Bad".into(),
            tags: vec!["leaked".into()],
            image_id: main,
            photo_image_ids: photos.clone(),
            ..Default::default()
        };
        let r = c.s.recipes.create(c.user, input()).await;
        assert!(
            matches!(r, Err(DomainError::Validation(_))),
            "create: {r:?}"
        );
        assert_eq!(
            c.query(SearchQuery::default()).await.1,
            0,
            "nothing was saved"
        );
        assert!(
            c.s.tags.list_in_use().await.unwrap().is_empty(),
            "no tag was saved"
        );

        let id = c.add("Good", &[], None, &["kept"]).await;
        let r = c.s.recipes.update(id, c.user, input()).await;
        assert!(
            matches!(r, Err(DomainError::Validation(_))),
            "update: {r:?}"
        );
        let still = c.s.recipes.get(id).await.unwrap().unwrap();
        assert_eq!(
            (still.title.as_str(), still.tags),
            ("Good", vec!["kept".to_string()])
        );
        c.s.recipes.soft_delete(id).await.unwrap();
    }
}

async fn create_many_is_all_or_nothing<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let good = |t: &str| RecipeInput {
        title: t.into(),
        tags: vec!["batch".into()],
        ..Default::default()
    };
    let ids =
        c.s.recipes
            .create_many(c.user, vec![good("One"), good("Two")])
            .await
            .unwrap();
    assert_eq!(ids.len(), 2);
    let one = c.s.recipes.get(ids[0]).await.unwrap().unwrap();
    assert_eq!(
        (one.title.as_str(), one.tags),
        ("One", vec!["batch".into()])
    );
    assert_eq!(c.query(SearchQuery::default()).await.1, 2);

    // The second recipe names an unknown image: the first must not be kept, live or deleted.
    let bad = RecipeInput {
        image_id: Some(Uuid::new_v4()),
        ..good("Bad")
    };
    let r =
        c.s.recipes
            .create_many(c.user, vec![good("Three"), bad])
            .await;
    assert!(matches!(r, Err(DomainError::Validation(_))), "{r:?}");
    assert_eq!(c.query(SearchQuery::default()).await.1, 2, "nothing added");
    assert!(
        c.s.recipes
            .create_many(c.user, vec![])
            .await
            .unwrap()
            .is_empty()
    );
}

async fn delete_hides_the_recipe<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let id = c.add("Gone", &[], None, &[]).await;
    c.s.recipes.soft_delete(id).await.unwrap();
    assert!(c.s.recipes.get(id).await.unwrap().is_none());
    for again in [id, Uuid::new_v4()] {
        let r = c.s.recipes.soft_delete(again).await;
        assert!(matches!(r, Err(DomainError::NotFound(_))), "{r:?}");
    }
}

async fn deleting_stamps_the_clock<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // The delete time is the clock's now at the moment of the delete: not the creation time, not the epoch.
    // `purge_deleted_before` removes recipes deleted strictly before its cutoff, so it pins the stamp to the ms.
    let c = Ctx::new(make).await;
    let id = c.add("Stamped", &["salt"], None, &["t"]).await;
    c.clock.advance(Duration::minutes(5));
    let deleted_at = c.clock.now();
    c.s.recipes.soft_delete(id).await.unwrap();
    assert!(c.s.recipes.get(id).await.unwrap().is_none());
    let hits = c.s.recipes.search(SearchQuery::default()).await.unwrap();
    assert_eq!((hits.total, hits.items.len()), (0, 0), "gone from search");
    assert_eq!(
        c.s.recipes.purge_deleted_before(deleted_at).await.unwrap(),
        0,
        "deleted at the cutoff is not before it"
    );
    assert_eq!(
        c.s.recipes
            .purge_deleted_before(deleted_at + ms(1))
            .await
            .unwrap(),
        1,
        "stamped with the clock's now"
    );
}

async fn live_source_urls_prefilter<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let mut ids = Vec::new();
    for (title, url) in [
        ("Old", Some("https://Example.com/a")),
        ("Other site", Some("https://other.org/b")),
        ("No source", None),
        ("New", Some("https://www.example.com/c?x=1")),
        ("Deleted", Some("https://example.com/d")),
    ] {
        c.clock.advance(Duration::seconds(1));
        let r =
            c.s.recipes
                .create(
                    c.user,
                    RecipeInput {
                        title: title.into(),
                        source_url: url.map(String::from),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();
        ids.push(r.id);
    }
    c.s.recipes.soft_delete(ids[4]).await.unwrap();
    let hosts = |h: &[&str]| h.iter().map(|s| (*s).to_string()).collect::<Vec<_>>();
    let found =
        c.s.recipes
            .live_source_urls(&hosts(&["EXAMPLE.com"]))
            .await
            .unwrap();
    assert_eq!(
        found,
        [
            (ids[0], "https://Example.com/a".to_string()),
            (ids[3], "https://www.example.com/c?x=1".to_string()),
        ],
        "case-insensitive, oldest first, no deleted, no recipe without a source"
    );
    let two =
        c.s.recipes
            .live_source_urls(&hosts(&["other.org", "nowhere.net"]))
            .await
            .unwrap();
    assert_eq!(two.iter().map(|r| r.0).collect::<Vec<_>>(), [ids[1]]);
    assert!(
        c.s.recipes.live_source_urls(&[]).await.unwrap().is_empty(),
        "no hosts, no rows"
    );
    assert!(
        c.s.recipes
            .live_source_urls(&hosts(&["%", "_"]))
            .await
            .unwrap()
            .is_empty(),
        "a host is text, not a pattern"
    );
}

async fn restore_window_edges<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // A recipe deleted at T can be restored while now - T < the window; exactly the window is too late.
    let window = Duration::minutes(i64::from(RESTORE_WINDOW_MINUTES));
    let c = Ctx::new(make).await;
    for (after, restorable) in [
        (window - ms(1), true),
        (window, false),
        (window + ms(1), false),
    ] {
        let id = c.add("Edge", &[], None, &["t"]).await;
        c.s.recipes.soft_delete(id).await.unwrap();
        c.clock.advance(after);
        let r = c.s.recipes.restore(id).await;
        if restorable {
            assert_eq!(r.expect("restorable").id, id, "after {after}");
            assert!(c.s.recipes.get(id).await.unwrap().is_some());
            assert_eq!(c.find("edge").await.len(), 1, "back in search");
        } else {
            assert!(
                matches!(r, Err(DomainError::Conflict(_))),
                "after {after}: {r:?}"
            );
            assert!(c.s.recipes.get(id).await.unwrap().is_none());
        }
    }
    let live = c.add("Live", &[], None, &[]).await;
    assert_eq!(
        c.s.recipes.restore(live).await.unwrap().id,
        live,
        "restoring a live recipe is a no-op"
    );
    let r = c.s.recipes.restore(Uuid::new_v4()).await;
    assert!(matches!(r, Err(DomainError::NotFound(_))), "{r:?}");
}

async fn purge_edges<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Purge removes recipes deleted strictly before its cutoff (now - PURGE_AFTER); live ones stay.
    for (after, purged) in [
        (PURGE_AFTER - ms(1), false),
        (PURGE_AFTER, false),
        (PURGE_AFTER + ms(1), true),
    ] {
        let c = Ctx::new(make).await;
        let old = c.add("Old", &[], None, &["t"]).await;
        let live = c.add("Live", &[], None, &["t"]).await;
        c.s.recipes.soft_delete(old).await.unwrap();
        c.clock.advance(after);
        let n =
            c.s.recipes
                .purge_deleted_before(c.clock.now() - PURGE_AFTER)
                .await
                .unwrap();
        assert_eq!(n, u64::from(purged), "after {after}");
        // A purged row is gone for good; a kept one is merely too old to restore.
        let r = c.s.recipes.restore(old).await;
        if purged {
            assert!(
                matches!(r, Err(DomainError::NotFound(_))),
                "after {after}: {r:?}"
            );
        } else {
            assert!(
                matches!(r, Err(DomainError::Conflict(_))),
                "after {after}: {r:?}"
            );
        }
        assert!(c.s.recipes.get(live).await.unwrap().is_some());
    }
}

async fn ingredient_and_title_matches<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    assert_eq!(
        c.find_sorted("buttermilk").await,
        ["Buttermilk pancakes", "Weeknight lasagne"]
    );
    assert_eq!(
        c.find("lasag").await,
        ["Weeknight lasagne"],
        "partial word inside a title"
    );
    assert_eq!(c.find("weeknight lasag").await, ["Weeknight lasagne"]);
    assert_eq!(
        c.find("Apple C").await,
        ["Apple crumble"],
        "title prefix across a space"
    );
    assert_eq!(
        c.find("  TOMATO ").await,
        ["Tomato soup"],
        "case and padding"
    );
    assert!(c.find("zzz").await.is_empty());
    assert_eq!(
        c.find("500g beef").await,
        ["Weeknight lasagne"],
        "ingredient lines are searched"
    );
    assert_eq!(
        c.query(SearchQuery {
            text: Some("  ".into()),
            ..Default::default()
        })
        .await
        .1,
        4,
        "blank text is no filter"
    );
}

async fn websearch_syntax<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F, caps: Capabilities) {
    let c = Ctx::new(make).await;
    c.seed().await;
    if caps.phrase_search {
        assert_eq!(c.find("\"beef mince\"").await, ["Weeknight lasagne"]);
        assert!(
            c.find("\"mince beef\"").await.is_empty(),
            "phrase order matters"
        );
    } else {
        skip("recipe_repo::websearch_syntax (phrase)", "phrase_search");
    }
    if caps.boolean_operators {
        assert_eq!(c.find("buttermilk -pancakes").await, ["Weeknight lasagne"]);
        assert_eq!(
            c.find_sorted("tomato or apples").await,
            ["Apple crumble", "Tomato soup"]
        );
    } else {
        skip(
            "recipe_repo::websearch_syntax (-exclude, or)",
            "boolean_operators",
        );
    }
}

async fn tag_and_query_combine<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    assert_eq!(
        c.find_in("buttermilk", "dinner").await,
        (vec!["Weeknight lasagne".to_string()], 1)
    );
    assert_eq!(c.find_in("buttermilk", "dessert").await, (vec![], 0));
    assert_eq!(
        c.find_in("buttermilk", "DINNER ").await.1,
        1,
        "the tag is trimmed and case-insensitive"
    );
    let by_tag = SearchQuery {
        tag: Some("dinner".into()),
        sort: Sort::Title,
        ..Default::default()
    };
    assert_eq!(
        c.query(by_tag).await.0,
        ["Tomato soup", "Weeknight lasagne"]
    );
}

async fn tag_names_are_searched<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    let both = ["Tomato soup", "Weeknight lasagne"];
    assert_eq!(c.find_sorted("dinner").await, both, "tag name, not in text");
    assert_eq!(c.find_sorted("DIN").await, both, "tag prefix, any case");
    assert_eq!(
        c.find_in("dinner", "pasta").await,
        (vec!["Weeknight lasagne".to_string()], 1)
    );
    assert_eq!(c.find_in("dinner", "dessert").await, (vec![], 0));
    assert_eq!(
        c.query(SearchQuery {
            text: Some("dinner".into()),
            ..Default::default()
        })
        .await
        .1,
        2
    );
}

async fn sorts_and_total<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    assert_eq!(
        c.all(Sort::Title).await,
        [
            "Apple crumble",
            "Buttermilk pancakes",
            "Tomato soup",
            "Weeknight lasagne"
        ]
    );
    assert_eq!(
        c.all(Sort::Time).await,
        [
            "Buttermilk pancakes",
            "Apple crumble",
            "Weeknight lasagne",
            "Tomato soup"
        ],
        "quickest first, no time last"
    );
    assert_eq!(c.all(Sort::Newest).await[0], "Apple crumble");
    assert_eq!(
        c.all(Sort::Default).await[0],
        "Apple crumble",
        "no text: newest first"
    );
    let by_time = SearchQuery {
        text: Some("buttermilk".into()),
        sort: Sort::Time,
        ..Default::default()
    };
    assert_eq!(
        c.query(by_time).await.0,
        ["Buttermilk pancakes", "Weeknight lasagne"],
        "an explicit sort beats relevance"
    );
    let page = SearchQuery {
        sort: Sort::Title,
        limit: 1,
        offset: 1,
        ..Default::default()
    };
    assert_eq!(
        c.query(page).await,
        (vec!["Buttermilk pancakes".to_string()], 4),
        "total ignores paging"
    );
}

async fn relevance_prefers_title_hits<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.add("Toast", &["bread", "butter"], None, &[]).await;
    c.add("Butter chicken", &["chicken"], None, &[]).await;
    assert_eq!(c.find("butter").await, ["Butter chicken", "Toast"]);
}

async fn soft_deleted_are_excluded<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    let id = c
        .add("Buttermilk waffles", &["buttermilk"], None, &["breakfast"])
        .await;
    assert_eq!(c.find("waffles").await.len(), 1);
    c.s.recipes.soft_delete(id).await.unwrap();
    assert!(c.find("waffles").await.is_empty());
    assert_eq!(c.find_in("buttermilk", "breakfast").await.1, 1);
}

async fn special_characters_are_literal_and_safe<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.seed().await;
    c.add("100% juice", &["oranges"], None, &[]).await;
    c.add("Mom's pie", &["apples"], None, &[]).await;
    c.add("a_b stew", &["beans"], None, &[]).await;
    c.add("axb stew", &["beans"], None, &[]).await;
    assert_eq!(c.find("100%").await, ["100% juice"]);
    assert!(c.find("%").await.len() <= 1, "% must not match everything");
    assert_eq!(c.find("a_b").await, ["a_b stew"], "_ is not a wildcard");
    assert_eq!(c.find("Mom's").await, ["Mom's pie"]);
    for q in [
        "'",
        "\\",
        "\"",
        "-",
        "(",
        ")",
        ":*",
        "&|!",
        "a\\",
        "'; drop table recipes; --",
        "é",
        "<->",
        "a\u{0}b",
        "\u{0}",
    ] {
        c.find(q).await; // must answer, not error
    }
    let tag = SearchQuery {
        tag: Some("a\u{0}b".into()),
        ..Default::default()
    };
    assert_eq!(c.query(tag).await.1, 0, "NUL in a tag is dropped");
    assert_eq!(
        c.query(SearchQuery::default()).await.1,
        8,
        "nothing was dropped"
    );
}

async fn counts_over_many_recipes<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Counts, not timings. Recipe n is "lasagne" when n % 7 == 0 and has buttermilk when n % 5 == 0; lasagne
    // recipes also carry the tag `dinner`, all carry `weeknight`.
    let c = Ctx::new(make).await;
    for n in 1..=140 {
        let lasagne = n % 7 == 0;
        let milk = if n % 5 == 0 { "buttermilk" } else { "water" };
        let mut tags = vec!["weeknight", "family"];
        if lasagne {
            tags.push("dinner");
        }
        let id = c
            .add(
                &format!("Recipe {n} {}", if lasagne { "lasagne" } else { "stew" }),
                &["250 g plain flour", &format!("1 cup {milk}")],
                Some(n % 120),
                &tags,
            )
            .await;
        assert_ne!(id, Uuid::nil());
    }
    assert_eq!(c.count("buttermilk", None).await.1, 28);
    assert_eq!(c.count("lasag", None).await.1, 20);
    // (text, total, total with tag `dinner`). `weeknight lasag` finds nothing: `weeknight` is only a tag and
    // `lasag` only in titles, and terms are not combined across fields.
    for (text, any, dinner) in [
        ("weeknight lasag", 0, 0),
        ("recipe 12 stew", 1, 0),
        ("dinner", 20, 20),
    ] {
        let (items, n) = c.count(text, None).await;
        assert_eq!(n, any, "{text}");
        assert!(items.len() as i64 <= n);
        assert_eq!(
            c.count(text, Some("dinner")).await.1,
            dinner,
            "{text} + dinner"
        );
    }
    let page = c
        .query(SearchQuery {
            limit: 10,
            offset: 135,
            ..Default::default()
        })
        .await;
    assert_eq!(
        (page.0.len(), page.1),
        (5, 140),
        "the last page is short; total is everything"
    );
}
