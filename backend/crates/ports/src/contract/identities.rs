//! Cases for the identity (linked Google account) repository.

use std::sync::Arc;

use domain::{DomainError, NewIdentity, PROVIDER_GOOGLE, chrono::Duration, uuid::Uuid};

use super::{Ctx, Stack, accounts::join2, epoch, new_user};
use crate::Clock;

pub async fn identity_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    linking_and_finding(&make).await;
    an_account_links_once(&make).await;
    concurrent_links_of_one_account(&make).await;
    listing_is_per_member_oldest_first(&make).await;
    unlinking_is_for_the_owner(&make).await;
    links_need_a_user_and_go_with_them(&make).await;
}

fn link(user_id: Uuid, subject: &str, email: &str) -> NewIdentity {
    NewIdentity {
        user_id,
        provider: PROVIDER_GOOGLE.into(),
        subject: subject.into(),
        email: email.into(),
    }
}

async fn linking_and_finding<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    assert!(
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-1")
            .await
            .unwrap()
            .is_none()
    );
    c.clock.advance(Duration::seconds(5));
    let made =
        c.s.identities
            .create(link(c.user, "sub-1", "sam@example.com"))
            .await
            .unwrap();
    assert_eq!(
        (
            made.user_id,
            made.provider.as_str(),
            made.subject.as_str(),
            made.email.as_str()
        ),
        (c.user, "google", "sub-1", "sam@example.com")
    );
    assert_eq!(
        made.created_at,
        epoch() + Duration::seconds(5),
        "stamped by the clock"
    );
    let found =
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-1")
            .await
            .unwrap()
            .unwrap();
    assert_eq!(found, made);
    // The provider is part of the key.
    assert!(
        c.s.identities
            .find("other", "sub-1")
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-2")
            .await
            .unwrap()
            .is_none()
    );
}

async fn an_account_links_once<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    c.s.identities
        .create(link(c.user, "sub-1", "a@example.com"))
        .await
        .unwrap();
    for owner in [c.user, other] {
        let again =
            c.s.identities
                .create(link(owner, "sub-1", "a@example.com"))
                .await;
        assert!(matches!(again, Err(DomainError::Conflict(_))), "{again:?}");
    }
    assert_eq!(
        c.s.identities.list(other).await.unwrap().len(),
        0,
        "nothing was linked"
    );
    // Another provider's account with the same id is another account.
    let mut elsewhere = link(other, "sub-1", "a@example.com");
    elsewhere.provider = "other".into();
    c.s.identities.create(elsewhere).await.unwrap();
}

async fn concurrent_links_of_one_account<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    let (a, b) = join2(
        c.s.identities
            .create(link(c.user, "sub-1", "a@example.com")),
        c.s.identities.create(link(other, "sub-1", "a@example.com")),
    )
    .await;
    let ok = [a.is_ok(), b.is_ok()].into_iter().filter(|x| *x).count();
    assert_eq!(ok, 1, "exactly one link wins: {a:?} {b:?}");
    let loser = a.err().or(b.err()).expect("one failed");
    assert!(matches!(loser, DomainError::Conflict(_)), "{loser:?}");
}

async fn listing_is_per_member_oldest_first<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    assert!(c.s.identities.list(c.user).await.unwrap().is_empty());
    for (owner, sub) in [(c.user, "sub-b"), (other, "sub-x"), (c.user, "sub-a")] {
        c.clock.advance(Duration::seconds(1));
        c.s.identities
            .create(link(owner, sub, "e@example.com"))
            .await
            .unwrap();
    }
    let mine: Vec<_> =
        c.s.identities
            .list(c.user)
            .await
            .unwrap()
            .into_iter()
            .map(|i| i.subject)
            .collect();
    assert_eq!(mine, ["sub-b", "sub-a"]);
    let theirs: Vec<_> =
        c.s.identities
            .list(other)
            .await
            .unwrap()
            .into_iter()
            .map(|i| i.subject)
            .collect();
    assert_eq!(theirs, ["sub-x"]);
}

async fn unlinking_is_for_the_owner<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    let mine =
        c.s.identities
            .create(link(c.user, "sub-1", "a@example.com"))
            .await
            .unwrap();

    let not_theirs = c.s.identities.delete(other, mine.id).await;
    assert!(
        matches!(not_theirs, Err(DomainError::NotFound(_))),
        "{not_theirs:?}"
    );
    assert!(
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-1")
            .await
            .unwrap()
            .is_some(),
        "still linked"
    );
    let unknown = c.s.identities.delete(c.user, Uuid::new_v4()).await;
    assert!(
        matches!(unknown, Err(DomainError::NotFound(_))),
        "{unknown:?}"
    );

    c.s.identities.delete(c.user, mine.id).await.unwrap();
    assert!(
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-1")
            .await
            .unwrap()
            .is_none()
    );
    let twice = c.s.identities.delete(c.user, mine.id).await;
    assert!(matches!(twice, Err(DomainError::NotFound(_))), "{twice:?}");
    // The account can be linked again, by anyone.
    c.s.identities
        .create(link(other, "sub-1", "a@example.com"))
        .await
        .unwrap();
}

async fn links_need_a_user_and_go_with_them<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let missing =
        c.s.identities
            .create(link(Uuid::new_v4(), "sub-1", "a@example.com"))
            .await;
    assert!(
        matches!(missing, Err(DomainError::NotFound(_))),
        "{missing:?}"
    );

    let member =
        c.s.users
            .create(new_user("member", "Member", "member"))
            .await
            .unwrap()
            .id;
    c.s.identities
        .create(link(member, "sub-2", "m@example.com"))
        .await
        .unwrap();
    c.s.users.remove(member).await.unwrap();
    assert!(
        c.s.identities
            .find(PROVIDER_GOOGLE, "sub-2")
            .await
            .unwrap()
            .is_none()
    );
}
