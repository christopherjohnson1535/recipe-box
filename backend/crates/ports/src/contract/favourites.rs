//! Cases for favourites (REC-5): each member's own stars, and the search filter that uses them.

use std::{collections::HashSet, sync::Arc};

use domain::{DomainError, SearchQuery, Sort, chrono::Duration, uuid::Uuid};

use super::{Ctx, Stack, new_user};
use crate::Clock;

pub async fn favourite_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    stars_are_per_member_and_idempotent(&make).await;
    a_deleted_or_unknown_recipe_takes_no_star(&make).await;
    stars_follow_their_recipe_through_delete_restore_and_purge(&make).await;
    a_removed_members_stars_go_with_them(&make).await;
    search_keeps_one_members_favourites_with_the_other_filters(&make).await;
}

async fn sam(c: &Ctx) -> Uuid {
    c.s.users
        .create(new_user("sam", "Sam", "member"))
        .await
        .unwrap()
        .id
}

fn set(ids: &[Uuid]) -> HashSet<Uuid> {
    ids.iter().copied().collect()
}

async fn stars_are_per_member_and_idempotent<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let sam = sam(&c).await;
    let soup = c.add("Soup", &[], None, &[]).await;
    let stew = c.add("Stew", &[], None, &[]).await;
    let fav = &c.s.favourites;

    fav.add(c.user, soup).await.unwrap();
    fav.add(c.user, soup).await.unwrap(); // starring twice is one star
    fav.add(sam, stew).await.unwrap();
    let both = [soup, stew, Uuid::new_v4()];
    assert_eq!(fav.among(c.user, &both).await.unwrap(), set(&[soup]));
    assert_eq!(
        fav.among(sam, &both).await.unwrap(),
        set(&[stew]),
        "not shared"
    );
    assert!(fav.among(c.user, &[]).await.unwrap().is_empty());

    fav.remove(c.user, soup).await.unwrap();
    fav.remove(c.user, soup).await.unwrap(); // nothing to remove is fine
    fav.remove(c.user, stew).await.unwrap(); // someone else's star is untouched
    assert!(fav.among(c.user, &both).await.unwrap().is_empty());
    assert_eq!(fav.among(sam, &both).await.unwrap(), set(&[stew]));
}

async fn a_deleted_or_unknown_recipe_takes_no_star<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    // A member removed after signing in: refused, nothing saved.
    let gone = c.s.favourites.add(Uuid::new_v4(), r).await;
    assert!(
        matches!(gone, Err(DomainError::Unauthenticated(_))),
        "{gone:?}"
    );
    c.s.recipes.soft_delete(r).await.unwrap();
    for recipe in [r, Uuid::new_v4()] {
        let got = c.s.favourites.add(c.user, recipe).await;
        assert!(matches!(got, Err(DomainError::NotFound(_))), "{got:?}");
    }
    c.s.recipes.restore(r).await.unwrap();
    assert!(
        c.s.favourites.among(c.user, &[r]).await.unwrap().is_empty(),
        "nothing saved"
    );
}

async fn stars_follow_their_recipe_through_delete_restore_and_purge<
    F: Fn(Arc<dyn Clock>) -> Stack,
>(
    make: &F,
) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    let kept = c.add("Stew", &[], None, &[]).await;
    c.s.favourites.add(c.user, r).await.unwrap();
    c.s.favourites.add(c.user, kept).await.unwrap();
    let starred = || async { c.s.favourites.among(c.user, &[r, kept]).await.unwrap() };

    c.s.recipes.soft_delete(r).await.unwrap();
    assert_eq!(starred().await, set(&[r, kept]), "kept while deleted");
    let only = SearchQuery {
        favourite_of: Some(c.user),
        ..Default::default()
    };
    let listed = c.s.recipes.search(only.clone()).await.unwrap();
    assert_eq!(listed.total, 1, "a deleted recipe is not listed");
    // Unstarring a deleted recipe works too (the service decides whether to allow it).
    c.s.recipes.restore(r).await.unwrap();
    assert_eq!(starred().await, set(&[r, kept]), "back with the recipe");
    assert_eq!(c.s.recipes.search(only).await.unwrap().total, 2);

    c.s.recipes.soft_delete(r).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    let purged =
        c.s.recipes
            .purge_deleted_before(c.clock.now())
            .await
            .unwrap();
    assert_eq!(purged, 1);
    assert_eq!(starred().await, set(&[kept]), "gone with the purge");
}

async fn a_removed_members_stars_go_with_them<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let sam = sam(&c).await;
    let r = c.add("Soup", &[], None, &[]).await;
    c.s.favourites.add(sam, r).await.unwrap();
    c.s.favourites.add(c.user, r).await.unwrap();
    c.s.users.remove(sam).await.unwrap();
    assert!(c.s.favourites.among(sam, &[r]).await.unwrap().is_empty());
    assert_eq!(
        c.s.favourites.among(c.user, &[r]).await.unwrap(),
        set(&[r]),
        "other members keep theirs"
    );
    // A new member never inherits anything (no row is left behind to match a reused id).
    let found = c.s.recipes.search(SearchQuery {
        favourite_of: Some(sam),
        ..Default::default()
    });
    assert_eq!(found.await.unwrap().total, 0);
}

async fn search_keeps_one_members_favourites_with_the_other_filters<
    F: Fn(Arc<dyn Clock>) -> Stack,
>(
    make: &F,
) {
    let c = Ctx::new(make).await;
    let sam = sam(&c).await;
    let lasagne = c
        .add("Weeknight lasagne", &["pasta"], Some(60), &["dinner"])
        .await;
    let pasta = c
        .add("Quick pasta", &["pasta"], Some(15), &["dinner"])
        .await;
    let cake = c.add("Lemon cake", &["flour"], Some(50), &["baking"]).await;
    let _unstarred = c.add("Pasta salad", &["pasta"], Some(10), &["lunch"]).await;
    for r in [lasagne, pasta, cake] {
        c.s.favourites.add(c.user, r).await.unwrap();
    }
    c.s.favourites.add(sam, _unstarred).await.unwrap();

    let query = |text: Option<&str>, tag: Option<&str>, sort: Sort| SearchQuery {
        text: text.map(Into::into),
        tag: tag.map(Into::into),
        favourite_of: Some(c.user),
        sort,
        ..Default::default()
    };
    let titles = |q: SearchQuery| async {
        let page = c.s.recipes.search(q).await.unwrap();
        assert!(
            page.items.iter().all(|i| !i.is_favourite),
            "storage leaves is_favourite to the service"
        );
        (
            page.items.into_iter().map(|i| i.title).collect::<Vec<_>>(),
            page.total,
        )
    };

    assert_eq!(
        titles(query(None, None, Sort::Default)).await,
        (
            vec![
                "Lemon cake".to_string(),
                "Quick pasta".into(),
                "Weeknight lasagne".into()
            ],
            3
        ),
        "newest first, only mine"
    );
    assert_eq!(
        titles(query(Some("pasta"), None, Sort::Default)).await.1,
        2,
        "with search text: Pasta salad is not starred by this member"
    );
    assert_eq!(
        titles(query(Some("pasta"), Some("dinner"), Sort::Time)).await,
        (
            vec!["Quick pasta".to_string(), "Weeknight lasagne".into()],
            2
        ),
        "with a tag and a sort"
    );
    assert_eq!(
        titles(query(Some("weeknight lasag"), None, Sort::Default))
            .await
            .0,
        vec!["Weeknight lasagne".to_string()],
        "with a half-typed word"
    );
    assert_eq!(titles(query(None, Some("lunch"), Sort::Default)).await.1, 0);
    let page = SearchQuery {
        limit: 2,
        offset: 2,
        ..query(None, None, Sort::Title)
    };
    assert_eq!(
        titles(page).await,
        (vec!["Weeknight lasagne".to_string()], 3),
        "paged, total counts every match"
    );
    let theirs = SearchQuery {
        favourite_of: Some(sam),
        ..Default::default()
    };
    assert_eq!(titles(theirs).await.0, vec!["Pasta salad".to_string()]);
    let nobody = SearchQuery {
        favourite_of: Some(Uuid::new_v4()),
        ..Default::default()
    };
    assert_eq!(titles(nobody).await.1, 0);
}
