//! Cases for the users, sessions, settings, tags and images repositories.

use std::{sync::Arc, task::Poll};

use domain::{
    DomainError, Image, ROLE_ADMIN, RecipeInput, Settings, TagCount, chrono::Duration, uuid::Uuid,
};

use super::{Ctx, ManualClock, Stack, epoch, ms, new_user};
use crate::Clock;

fn ready<T>(p: Poll<T>) -> Option<T> {
    match p {
        Poll::Ready(v) => Some(v),
        Poll::Pending => None,
    }
}

/// Runs two futures to completion side by side on the current task: both are polled until each is done, with no
/// timing involved, so the result depends only on what the adapter guarantees about overlapping calls.
async fn join2<A: Future, B: Future>(a: A, b: B) -> (A::Output, B::Output) {
    let (mut a, mut b) = (Box::pin(a), Box::pin(b));
    let (mut ra, mut rb) = (None, None);
    std::future::poll_fn(|cx| {
        ra = ra.take().or_else(|| ready(a.as_mut().poll(cx)));
        rb = rb.take().or_else(|| ready(b.as_mut().poll(cx)));
        if ra.is_some() && rb.is_some() {
            Poll::Ready(())
        } else {
            Poll::Pending
        }
    })
    .await;
    (ra.expect("a is done"), rb.expect("b is done"))
}

/// How long the cases make a session last. The suite fixes it; real code takes it from configuration.
const SESSION_LIFETIME: Duration = Duration::days(30);

fn token(n: u8) -> Vec<u8> {
    vec![n; 32]
}

pub async fn user_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    first_admin_only_once(&make).await;
    concurrent_first_admins(&make).await;
    usernames_are_unique_and_listed_in_order(&make).await;
    sign_in_lookup(&make).await;
    changing_a_password_ends_other_sessions(&make).await;
    stale_password_changes_are_refused(&make).await;
    concurrent_password_changes(&make).await;
    removing_users(&make).await;
    concurrent_removals_keep_an_admin(&make).await;
}

async fn first_admin_only_once<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let s = make(Arc::new(ManualClock::new()));
    assert!(!s.users.any().await.unwrap(), "a new store has no users");
    let admin = s
        .users
        .create_first_admin(new_user("alice", "Alice", ROLE_ADMIN))
        .await
        .unwrap();
    assert!(admin.is_admin());
    assert_eq!(admin.created_at, epoch(), "stamped by the clock");
    assert!(s.users.any().await.unwrap());
    let again = s
        .users
        .create_first_admin(new_user("bob", "Bob", ROLE_ADMIN))
        .await;
    assert!(matches!(again, Err(DomainError::Forbidden(_))), "{again:?}");
    assert_eq!(s.users.list().await.unwrap().len(), 1);
}

async fn usernames_are_unique_and_listed_in_order<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    for (username, display) in [("carol", "Carol"), ("bob2", "Bob"), ("bob", "bob")] {
        c.s.users
            .create(new_user(username, display, "member"))
            .await
            .unwrap();
    }
    let taken = c.s.users.create(new_user("BOB", "Other", "member")).await;
    assert!(
        matches!(taken, Err(DomainError::Conflict(_))),
        "usernames compare case-insensitively: {taken:?}"
    );
    let names: Vec<String> =
        c.s.users
            .list()
            .await
            .unwrap()
            .into_iter()
            .map(|u| u.username)
            .collect();
    assert_eq!(
        names,
        ["bob", "bob2", "carol", "tester"],
        "by lower-cased display name, then username"
    );
}

async fn sign_in_lookup<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let (user, hash) =
        c.s.users
            .find_with_hash("TESTER")
            .await
            .unwrap()
            .expect("found, any case");
    assert_eq!(
        (user.id, user.username.as_str(), hash.as_str()),
        (c.user, "tester", "hash")
    );
    assert!(c.s.users.find_with_hash("nobody").await.unwrap().is_none());
    assert_eq!(
        c.s.users.password_hash(c.user).await.unwrap().as_deref(),
        Some("hash")
    );
    assert!(
        c.s.users
            .password_hash(Uuid::new_v4())
            .await
            .unwrap()
            .is_none()
    );
}

async fn changing_a_password_ends_other_sessions<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    let expires = c.clock.now() + SESSION_LIFETIME;
    for (n, user) in [(1, c.user), (2, c.user), (3, other)] {
        c.s.sessions.create(user, token(n), expires).await.unwrap();
    }
    c.s.users
        .set_password_hash(c.user, "new", Some("hash"), Some(&token(1)))
        .await
        .unwrap();
    assert_eq!(
        c.s.users.password_hash(c.user).await.unwrap().as_deref(),
        Some("new")
    );
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_some(),
        "the kept session stays"
    );
    assert!(
        c.s.sessions
            .user_for_token(&token(2))
            .await
            .unwrap()
            .is_none(),
        "the user's other session ends"
    );
    assert!(
        c.s.sessions
            .user_for_token(&token(3))
            .await
            .unwrap()
            .is_some(),
        "other users are untouched"
    );
    c.s.users
        .set_password_hash(c.user, "newer", None, None)
        .await
        .unwrap();
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_none(),
        "nothing kept: all end"
    );
    let missing =
        c.s.users
            .set_password_hash(Uuid::new_v4(), "x", None, None)
            .await;
    assert!(
        matches!(missing, Err(DomainError::NotFound(_))),
        "{missing:?}"
    );
}

async fn stale_password_changes_are_refused<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.s.sessions
        .create(c.user, token(1), c.clock.now() + SESSION_LIFETIME)
        .await
        .unwrap();
    let stale =
        c.s.users
            .set_password_hash(c.user, "new", Some("not-the-hash"), None)
            .await;
    assert!(matches!(stale, Err(DomainError::Conflict(_))), "{stale:?}");
    assert_eq!(
        c.s.users.password_hash(c.user).await.unwrap().as_deref(),
        Some("hash"),
        "nothing changed"
    );
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_some(),
        "sessions untouched"
    );
    // The hash the caller verified is the one that must still be stored.
    c.s.users
        .set_password_hash(c.user, "b", Some("hash"), None)
        .await
        .unwrap();
    let again =
        c.s.users
            .set_password_hash(c.user, "c", Some("hash"), None)
            .await;
    assert!(matches!(again, Err(DomainError::Conflict(_))), "{again:?}");
    assert_eq!(
        c.s.users.password_hash(c.user).await.unwrap().as_deref(),
        Some("b")
    );
}

async fn concurrent_password_changes<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Two changes that both verified "hash": exactly one is applied, the other is refused.
    let c = Ctx::new(make).await;
    let (x, y) = join2(
        c.s.users.set_password_hash(c.user, "x", Some("hash"), None),
        c.s.users.set_password_hash(c.user, "y", Some("hash"), None),
    )
    .await;
    let ok = [x.is_ok(), y.is_ok()].into_iter().filter(|v| *v).count();
    assert_eq!(ok, 1, "exactly one change is applied: {x:?} {y:?}");
    let loser = x.err().or(y.err()).expect("one failed");
    assert!(matches!(loser, DomainError::Conflict(_)), "{loser:?}");
    let stored = c.s.users.password_hash(c.user).await.unwrap();
    assert!(matches!(stored.as_deref(), Some("x" | "y")));
}

async fn concurrent_first_admins<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let s = make(Arc::new(ManualClock::new()));
    let (a, b) = join2(
        s.users
            .create_first_admin(new_user("alice", "Alice", ROLE_ADMIN)),
        s.users
            .create_first_admin(new_user("bob", "Bob", ROLE_ADMIN)),
    )
    .await;
    let ok = [a.is_ok(), b.is_ok()].into_iter().filter(|x| *x).count();
    assert_eq!(ok, 1, "exactly one setup wins: {a:?} {b:?}");
    let loser = a.err().or(b.err()).expect("one failed");
    assert!(matches!(loser, DomainError::Forbidden(_)), "{loser:?}");
    assert_eq!(s.users.list().await.unwrap().len(), 1);
}

async fn concurrent_removals_keep_an_admin<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Two admins each removed by a concurrent call: one succeeds, the other is refused as the last admin.
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("second", "Second", ROLE_ADMIN))
            .await
            .unwrap()
            .id;
    let (a, b) = join2(c.s.users.remove(c.user), c.s.users.remove(other)).await;
    let ok = [a.is_ok(), b.is_ok()].into_iter().filter(|x| *x).count();
    assert_eq!(ok, 1, "exactly one removal passes: {a:?} {b:?}");
    let loser = a.err().or(b.err()).expect("one failed");
    assert!(matches!(loser, DomainError::Forbidden(_)), "{loser:?}");
    let left = c.s.users.list().await.unwrap();
    assert_eq!(left.len(), 1);
    assert!(left[0].is_admin(), "an admin remains");
}

async fn removing_users<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let missing = c.s.users.remove(Uuid::new_v4()).await;
    assert!(
        matches!(missing, Err(DomainError::NotFound(_))),
        "{missing:?}"
    );
    let last = c.s.users.remove(c.user).await;
    assert!(
        matches!(last, Err(DomainError::Forbidden(_))),
        "the last admin stays: {last:?}"
    );

    let recipe = c.add("Mine", &[], None, &[]).await;
    c.s.sessions
        .create(c.user, token(1), c.clock.now() + SESSION_LIFETIME)
        .await
        .unwrap();
    let root =
        c.s.users
            .create(new_user("root", "Root", ROLE_ADMIN))
            .await
            .unwrap()
            .id;
    c.s.users.remove(c.user).await.unwrap();
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_none(),
        "their sessions go with them"
    );
    let kept =
        c.s.recipes
            .get(recipe)
            .await
            .unwrap()
            .expect("their recipes stay");
    assert!(
        kept.created_by.is_none() && kept.updated_by.is_none(),
        "with the creator cleared"
    );
    let last = c.s.users.remove(root).await;
    assert!(matches!(last, Err(DomainError::Forbidden(_))), "{last:?}");

    let member =
        c.s.users
            .create(new_user("member", "Member", "member"))
            .await
            .unwrap()
            .id;
    c.s.users.remove(member).await.unwrap();
    assert_eq!(c.s.users.list().await.unwrap().len(), 1);
}

pub async fn session_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    expiry_edges(&make).await;
    purge_edges(&make).await;
    ending_a_session(&make).await;
    creating_a_session_is_checked(&make).await;
}

async fn expiry_edges<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Issued at T, a session works while now < T + lifetime.
    let c = Ctx::new(make).await;
    for (n, (after, valid)) in [
        (SESSION_LIFETIME - ms(1), true),
        (SESSION_LIFETIME, false),
        (SESSION_LIFETIME + ms(1), false),
    ]
    .into_iter()
    .enumerate()
    {
        let t = token(n as u8);
        c.s.sessions
            .create(c.user, t.clone(), c.clock.now() + SESSION_LIFETIME)
            .await
            .unwrap();
        assert!(c.s.sessions.user_for_token(&t).await.unwrap().is_some());
        c.clock.advance(after);
        let user = c.s.sessions.user_for_token(&t).await.unwrap();
        assert_eq!(user.map(|u| u.id), valid.then_some(c.user), "after {after}");
    }
    assert!(
        c.s.sessions
            .user_for_token(&token(200))
            .await
            .unwrap()
            .is_none(),
        "unknown token"
    );
}

async fn purge_edges<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    // Purge removes sessions whose expiry is strictly in the past.
    for (after, purged) in [
        (SESSION_LIFETIME - ms(1), false),
        (SESSION_LIFETIME, false),
        (SESSION_LIFETIME + ms(1), true),
    ] {
        let c = Ctx::new(make).await;
        c.s.sessions
            .create(c.user, token(1), c.clock.now() + SESSION_LIFETIME)
            .await
            .unwrap();
        c.clock.advance(after);
        assert_eq!(
            c.s.sessions.purge_expired().await.unwrap(),
            u64::from(purged),
            "after {after}"
        );
        assert_eq!(
            c.s.sessions.purge_expired().await.unwrap(),
            0,
            "nothing is purged twice"
        );
    }
}

async fn creating_a_session_is_checked<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let expires = c.clock.now() + SESSION_LIFETIME;
    let unknown = c.s.sessions.create(Uuid::new_v4(), token(1), expires).await;
    assert!(
        matches!(unknown, Err(DomainError::NotFound(_))),
        "{unknown:?}"
    );
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_none()
    );

    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    c.s.sessions
        .create(c.user, token(2), expires)
        .await
        .unwrap();
    let dup = c.s.sessions.create(other, token(2), expires + ms(1)).await;
    assert!(matches!(dup, Err(DomainError::Conflict(_))), "{dup:?}");
    let still = c.s.sessions.user_for_token(&token(2)).await.unwrap();
    assert_eq!(
        still.map(|u| u.id),
        Some(c.user),
        "the first session is not overwritten"
    );
}

async fn ending_a_session<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.s.sessions
        .create(c.user, token(1), c.clock.now() + SESSION_LIFETIME)
        .await
        .unwrap();
    c.s.sessions.delete(&token(1)).await.unwrap();
    assert!(
        c.s.sessions
            .user_for_token(&token(1))
            .await
            .unwrap()
            .is_none()
    );
    c.s.sessions
        .delete(&token(1))
        .await
        .expect("ending a session twice is fine");
}

pub async fn settings_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    let c = Ctx::new(&make).await;
    assert!(
        c.s.settings.get().await.unwrap().plate_treatment,
        "on by default"
    );
    let off = Settings {
        plate_treatment: false,
    };
    assert_eq!(c.s.settings.set(off).await.unwrap(), off);
    assert_eq!(c.s.settings.get().await.unwrap(), off);
    c.s.settings
        .set(Settings {
            plate_treatment: true,
        })
        .await
        .unwrap();
    assert!(c.s.settings.get().await.unwrap().plate_treatment);
}

pub async fn tag_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    let c = Ctx::new(&make).await;
    assert!(c.s.tags.list_in_use().await.unwrap().is_empty());
    c.add("A", &[], None, &["b", "a"]).await;
    let second = c.add("B", &[], None, &["a"]).await;
    let third = c.add("C", &[], None, &["c"]).await;
    let tag = |name: &str, count| TagCount {
        name: name.into(),
        count,
    };
    assert_eq!(
        c.s.tags.list_in_use().await.unwrap(),
        [tag("a", 2), tag("b", 1), tag("c", 1)],
        "by name, with counts"
    );
    c.s.recipes.soft_delete(second).await.unwrap();
    c.s.recipes.soft_delete(third).await.unwrap();
    assert_eq!(
        c.s.tags.list_in_use().await.unwrap(),
        [tag("a", 1), tag("b", 1)],
        "deleted recipes do not count"
    );
}

pub async fn image_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    let c = Ctx::new(&make).await;
    let new = |name: &str| Image {
        id: Uuid::new_v4(),
        file_name: name.into(),
        display_file_name: None,
        width: 10,
        height: 20,
        bytes: 30,
        created_by: Some(c.user),
    };
    let (one, two, three) = (new("1.jpg"), new("2.jpg"), new("3.jpg"));
    let ids = (one.id, two.id, three.id);
    for i in [one, two, three] {
        c.s.images.add(i).await.unwrap();
    }
    let mut all = vec![ids.0, ids.1, ids.2];
    all.sort();
    assert_eq!(c.s.images.without_display_file().await.unwrap(), all);
    assert!(
        c.s.images
            .set_display_file(ids.0, "1.display.jpg")
            .await
            .unwrap()
    );
    assert!(
        !c.s.images
            .set_display_file(ids.0, "other.jpg")
            .await
            .unwrap(),
        "only the first rendition counts"
    );
    assert!(
        !c.s.images
            .set_display_file(Uuid::new_v4(), "x.jpg")
            .await
            .unwrap(),
        "the image is gone"
    );
    let mut rest = vec![ids.1, ids.2];
    rest.sort();
    assert_eq!(c.s.images.without_display_file().await.unwrap(), rest);

    let recipe =
        c.s.recipes
            .create(
                c.user,
                RecipeInput {
                    title: "Pictured".into(),
                    image_id: Some(ids.1),
                    photo_image_ids: vec![ids.2, ids.1],
                    ..Default::default()
                },
            )
            .await
            .unwrap();
    c.s.images.delete(&[ids.1, Uuid::new_v4()]).await.unwrap();
    let after = c.s.recipes.get(recipe.id).await.unwrap().unwrap();
    assert_eq!(after.image_id, None, "a recipe loses a deleted main image");
    assert_eq!(after.image_file, None);
    assert_eq!(
        (after.photo_image_ids, after.photo_files),
        (vec![ids.2], vec!["3.jpg".to_string()])
    );
    let gone =
        c.s.recipes
            .create(
                c.user,
                RecipeInput {
                    title: "x".into(),
                    image_id: Some(ids.1),
                    ..Default::default()
                },
            )
            .await;
    assert!(matches!(gone, Err(DomainError::Validation(_))), "{gone:?}");
}
