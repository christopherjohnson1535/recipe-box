//! Cases for the "made it" log (REC-6).

use std::sync::Arc;

use domain::{
    DomainError, NewCookLogEntry,
    chrono::{Duration, NaiveDate},
    uuid::Uuid,
};

use super::{Ctx, Stack, new_user};
use crate::Clock;

pub async fn cook_log_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    an_entry_reads_back_as_written(&make).await;
    entries_are_newest_first_per_recipe(&make).await;
    a_deleted_or_unknown_recipe_takes_no_entry(&make).await;
    entries_follow_their_recipe_through_delete_restore_and_purge(&make).await;
    a_removed_member_leaves_their_entries_unsigned(&make).await;
    an_entry_can_be_deleted_once(&make).await;
}

fn day(m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, m, d).expect("valid date")
}

fn entry(recipe_id: Uuid, user_id: Uuid, on: NaiveDate, note: &str) -> NewCookLogEntry {
    NewCookLogEntry {
        recipe_id,
        user_id,
        cooked_on: on,
        note: note.into(),
    }
}

async fn an_entry_reads_back_as_written<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    let made =
        c.s.cook_log
            .add(entry(r, c.user, day(3, 4), "less salt"))
            .await
            .unwrap();
    assert_eq!(made.recipe_id, r);
    assert_eq!(made.cooked_on, day(3, 4));
    assert_eq!(made.note, "less salt");
    assert_eq!(made.created_at, c.clock.now(), "stamped with the clock");
    let by = made.made_by.clone().expect("made by the case's user");
    assert_eq!((by.id, by.display_name.as_str()), (c.user, "Tester"));
    assert_eq!(c.s.cook_log.get(made.id).await.unwrap(), Some(made.clone()));
    assert_eq!(c.s.cook_log.list(r).await.unwrap(), vec![made]);
    assert_eq!(c.s.cook_log.get(Uuid::new_v4()).await.unwrap(), None);
}

async fn entries_are_newest_first_per_recipe<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let soup = c.add("Soup", &[], None, &[]).await;
    let stew = c.add("Stew", &[], None, &[]).await;
    let log = &c.s.cook_log;
    let older_day = log.add(entry(soup, c.user, day(1, 2), "a")).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    let first_of_day = log.add(entry(soup, c.user, day(2, 9), "b")).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    // Recorded later but for an earlier day: the cooking day decides.
    let backdated = log.add(entry(soup, c.user, day(1, 30), "c")).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    let second_of_day = log.add(entry(soup, c.user, day(2, 9), "d")).await.unwrap();
    let other = log.add(entry(stew, c.user, day(2, 10), "e")).await.unwrap();

    let ids = |v: Vec<domain::CookLogEntry>| v.into_iter().map(|e| e.id).collect::<Vec<_>>();
    assert_eq!(
        ids(log.list(soup).await.unwrap()),
        [
            second_of_day.id,
            first_of_day.id,
            backdated.id,
            older_day.id
        ]
    );
    assert_eq!(ids(log.list(stew).await.unwrap()), [other.id]);
    assert!(log.list(Uuid::new_v4()).await.unwrap().is_empty());
}

async fn a_deleted_or_unknown_recipe_takes_no_entry<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    c.s.recipes.soft_delete(r).await.unwrap();
    for recipe in [r, Uuid::new_v4()] {
        let got = c.s.cook_log.add(entry(recipe, c.user, day(3, 4), "")).await;
        assert!(matches!(got, Err(DomainError::NotFound(_))), "{got:?}");
    }
    c.s.recipes.restore(r).await.unwrap();
    assert!(
        c.s.cook_log.list(r).await.unwrap().is_empty(),
        "nothing saved"
    );
}

async fn entries_follow_their_recipe_through_delete_restore_and_purge<
    F: Fn(Arc<dyn Clock>) -> Stack,
>(
    make: &F,
) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    let kept = c.add("Stew", &[], None, &[]).await;
    let e =
        c.s.cook_log
            .add(entry(r, c.user, day(3, 4), "x"))
            .await
            .unwrap();
    let k =
        c.s.cook_log
            .add(entry(kept, c.user, day(3, 4), "y"))
            .await
            .unwrap();

    c.s.recipes.soft_delete(r).await.unwrap();
    assert_eq!(
        c.s.cook_log.get(e.id).await.unwrap(),
        Some(e.clone()),
        "kept while deleted"
    );
    c.s.recipes.restore(r).await.unwrap();
    assert_eq!(
        c.s.cook_log.list(r).await.unwrap(),
        vec![e.clone()],
        "back with the recipe"
    );

    c.s.recipes.soft_delete(r).await.unwrap();
    c.clock.advance(Duration::seconds(1));
    let purged =
        c.s.recipes
            .purge_deleted_before(c.clock.now())
            .await
            .unwrap();
    assert_eq!(purged, 1);
    assert_eq!(
        c.s.cook_log.get(e.id).await.unwrap(),
        None,
        "gone with the purge"
    );
    assert!(c.s.cook_log.list(r).await.unwrap().is_empty());
    assert_eq!(
        c.s.cook_log.get(k.id).await.unwrap(),
        Some(k),
        "other recipes untouched"
    );
}

async fn a_removed_member_leaves_their_entries_unsigned<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let sam =
        c.s.users
            .create(new_user("sam", "Sam", "member"))
            .await
            .unwrap()
            .id;
    let r = c.add("Soup", &[], None, &[]).await;
    let theirs =
        c.s.cook_log
            .add(entry(r, sam, day(3, 4), "more lemon"))
            .await
            .unwrap();
    let mine =
        c.s.cook_log
            .add(entry(r, c.user, day(3, 5), ""))
            .await
            .unwrap();
    c.s.users.remove(sam).await.unwrap();
    let left = c.s.cook_log.get(theirs.id).await.unwrap().expect("kept");
    assert_eq!(left.made_by, None);
    assert_eq!(left.note, "more lemon");
    assert_eq!(c.s.cook_log.get(mine.id).await.unwrap(), Some(mine));
}

async fn an_entry_can_be_deleted_once<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let r = c.add("Soup", &[], None, &[]).await;
    let a =
        c.s.cook_log
            .add(entry(r, c.user, day(3, 4), ""))
            .await
            .unwrap();
    let b =
        c.s.cook_log
            .add(entry(r, c.user, day(3, 5), ""))
            .await
            .unwrap();
    c.s.cook_log.delete(a.id).await.unwrap();
    assert_eq!(c.s.cook_log.get(a.id).await.unwrap(), None);
    assert_eq!(c.s.cook_log.list(r).await.unwrap(), vec![b]);
    let again = c.s.cook_log.delete(a.id).await;
    assert!(matches!(again, Err(DomainError::NotFound(_))), "{again:?}");
}
