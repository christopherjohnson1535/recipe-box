//! Cases for the Google connection repository.

use std::sync::Arc;

use domain::{DomainError, chrono::Duration, uuid::Uuid};

use super::{Ctx, Stack, epoch, new_user};
use crate::Clock;

pub async fn google_connection_repo<F: Fn(Arc<dyn Clock>) -> Stack>(make: F) {
    one_connection_per_user(&make).await;
    reconnecting_replaces_the_token_and_keeps_the_list(&make).await;
    deleting_forgets_everything(&make).await;
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
    assert_eq!(mine.sealed_token, [1, 2, 3]);
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
    assert_eq!(got.sealed_token, [9, 9]);
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
