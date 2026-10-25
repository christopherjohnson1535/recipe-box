//! Cases for the Google connection repository.

use std::sync::Arc;

use domain::{DomainError, chrono::Duration, uuid::Uuid};

use super::{Ctx, Stack, epoch, new_user};
use crate::Clock;

pub async fn google_connection_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    one_connection_per_user(&make).await;
    reconnecting_replaces_the_token_and_keeps_the_list(&make).await;
    forgetting_the_token_keeps_the_list(&make).await;
    deleting_forgets_everything(&make).await;
    one_export_at_a_time(&make).await;
    connections_need_a_user_and_go_with_them(&make).await;
}

async fn one_connection_per_user<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    assert_eq!(c.s.google.get(c.user).await.unwrap(), None);

    c.s.google
        .upsert(c.user, vec![1, 2, 3], epoch())
        .await
        .unwrap();
    c.s.google.set_tasklist(c.user, "list-a").await.unwrap();
    let mine = c.s.google.get(c.user).await.unwrap().expect("connected");
    assert_eq!(mine.sealed_token.as_deref(), Some([1, 2, 3].as_slice()));
    assert_eq!(mine.tasklist_id.as_deref(), Some("list-a"));
    assert_eq!(mine.connected_at, epoch());
    assert_eq!(c.s.google.get(other).await.unwrap(), None, "per user");

    // Setting the list of a user who is not connected is not an error and connects nobody.
    c.s.google.set_tasklist(other, "list-b").await.unwrap();
    assert_eq!(c.s.google.get(other).await.unwrap(), None);
}

async fn reconnecting_replaces_the_token_and_keeps_the_list<F: Fn(Arc<dyn Clock>) -> Stack>(
    make: &F,
) {
    let c = Ctx::new(make).await;
    c.s.google.upsert(c.user, vec![1], epoch()).await.unwrap();
    c.s.google.set_tasklist(c.user, "list-a").await.unwrap();
    let later = epoch() + Duration::days(2);
    c.s.google.upsert(c.user, vec![9, 9], later).await.unwrap();
    let got = c.s.google.get(c.user).await.unwrap().unwrap();
    assert_eq!(got.sealed_token.as_deref(), Some([9, 9].as_slice()));
    assert_eq!(got.connected_at, later);
    assert_eq!(got.tasklist_id.as_deref(), Some("list-a"));
    c.s.google.set_tasklist(c.user, "list-c").await.unwrap();
    assert_eq!(
        c.s.google
            .get(c.user)
            .await
            .unwrap()
            .unwrap()
            .tasklist_id
            .as_deref(),
        Some("list-c")
    );
}

async fn forgetting_the_token_keeps_the_list<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.s.google.forget_token(c.user).await.unwrap(); // none yet: fine
    assert_eq!(c.s.google.get(c.user).await.unwrap(), None);

    c.s.google.upsert(c.user, vec![1], epoch()).await.unwrap();
    c.s.google.set_tasklist(c.user, "list-a").await.unwrap();
    c.s.google.forget_token(c.user).await.unwrap();
    let kept =
        c.s.google
            .get(c.user)
            .await
            .unwrap()
            .expect("the row stays");
    assert_eq!(kept.sealed_token, None);
    assert_eq!(kept.tasklist_id.as_deref(), Some("list-a"));

    // Connecting again brings a token back to the same list.
    c.s.google.upsert(c.user, vec![2], epoch()).await.unwrap();
    let again = c.s.google.get(c.user).await.unwrap().unwrap();
    assert_eq!(again.sealed_token.as_deref(), Some([2].as_slice()));
    assert_eq!(again.tasklist_id.as_deref(), Some("list-a"));
}

async fn deleting_forgets_everything<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    c.s.google.delete(c.user).await.unwrap(); // none yet: fine
    c.s.google.upsert(c.user, vec![1], epoch()).await.unwrap();
    c.s.google.set_tasklist(c.user, "list-a").await.unwrap();
    c.s.google.delete(c.user).await.unwrap();
    assert_eq!(c.s.google.get(c.user).await.unwrap(), None);
    // Connecting again starts without the old list.
    c.s.google.upsert(c.user, vec![2], epoch()).await.unwrap();
    assert_eq!(
        c.s.google.get(c.user).await.unwrap().unwrap().tasklist_id,
        None
    );
}

async fn connections_need_a_user_and_go_with_them<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let missing = c.s.google.upsert(Uuid::new_v4(), vec![1], epoch()).await;
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
    c.s.google.upsert(member, vec![1], epoch()).await.unwrap();
    c.s.users.remove(member).await.unwrap();
    assert_eq!(c.s.google.get(member).await.unwrap(), None);
}

async fn one_export_at_a_time<F: Fn(Arc<dyn Clock>) -> Stack>(make: &F) {
    let c = Ctx::new(make).await;
    let stale = |at| at - Duration::minutes(2);
    let t0 = epoch();

    // No connection: nothing to lock.
    assert!(
        !c.s.google
            .claim_export(c.user, t0, stale(t0))
            .await
            .unwrap()
    );
    c.s.google.release_export(c.user).await.unwrap(); // fine

    c.s.google.upsert(c.user, vec![1], t0).await.unwrap();
    assert!(
        c.s.google
            .claim_export(c.user, t0, stale(t0))
            .await
            .unwrap()
    );
    // Held: a second claim, a minute later, is refused.
    let t1 = t0 + Duration::minutes(1);
    assert!(
        !c.s.google
            .claim_export(c.user, t1, stale(t1))
            .await
            .unwrap()
    );
    // Released: free again.
    c.s.google.release_export(c.user).await.unwrap();
    assert!(
        c.s.google
            .claim_export(c.user, t1, stale(t1))
            .await
            .unwrap()
    );
    // A holder that never let go is overtaken once it is older than the limit, not before.
    let t2 = t1 + Duration::minutes(2);
    assert!(
        !c.s.google
            .claim_export(c.user, t2, stale(t2))
            .await
            .unwrap()
    );
    let t3 = t2 + Duration::seconds(1);
    assert!(
        c.s.google
            .claim_export(c.user, t3, stale(t3))
            .await
            .unwrap()
    );

    // Per user, and reconnecting or forgetting the token does not free a running export.
    let other =
        c.s.users
            .create(new_user("other", "Other", "member"))
            .await
            .unwrap()
            .id;
    c.s.google.upsert(other, vec![1], t0).await.unwrap();
    assert!(c.s.google.claim_export(other, t3, stale(t3)).await.unwrap());
    c.s.google.forget_token(c.user).await.unwrap();
    c.s.google.upsert(c.user, vec![3], t3).await.unwrap();
    assert!(
        !c.s.google
            .claim_export(c.user, t3, stale(t3))
            .await
            .unwrap()
    );
}
