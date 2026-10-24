//! Cases for the media store and the password hasher.

use domain::DomainError;

use crate::{MediaStore, PasswordHasher};

/// `make` gives a new, empty store each time it is called.
pub async fn media_store<M: MediaStore>(make: impl Fn() -> M) {
    let m = make();
    assert_eq!(m.get("a.jpg").await.unwrap(), None, "nothing stored yet");
    m.put("a.jpg", vec![1, 2, 3]).await.unwrap();
    assert_eq!(m.get("a.jpg").await.unwrap(), Some(vec![1, 2, 3]));
    m.put("a.jpg", vec![9]).await.unwrap();
    assert_eq!(m.get("a.jpg").await.unwrap(), Some(vec![9]), "put replaces");
    m.put("b.jpg", vec![]).await.unwrap();
    assert_eq!(
        m.get("b.jpg").await.unwrap(),
        Some(vec![]),
        "an empty blob is not a missing one"
    );
    m.delete("a.jpg").await.unwrap();
    assert_eq!(m.get("a.jpg").await.unwrap(), None);
    assert!(m.get("b.jpg").await.unwrap().is_some(), "other blobs stay");
    m.delete("a.jpg")
        .await
        .expect("deleting a missing blob is fine");

    for bad in ["", "../a.jpg", "dir/a.jpg", "dir\\a.jpg", ".."] {
        let put = m.put(bad, vec![1]).await;
        assert!(
            matches!(put, Err(DomainError::Validation(_))),
            "put {bad:?}: {put:?}"
        );
        assert!(
            matches!(m.get(bad).await, Err(DomainError::Validation(_))),
            "get {bad:?}"
        );
        assert!(
            matches!(m.delete(bad).await, Err(DomainError::Validation(_))),
            "delete {bad:?}"
        );
    }
}

pub async fn password_hasher<H: PasswordHasher>(h: H) {
    let hash = h.hash("correct horse".into()).await.unwrap();
    assert!(!hash.is_empty() && hash != "correct horse");
    assert!(
        h.verify("correct horse".into(), Some(hash.clone()))
            .await
            .unwrap()
    );
    assert!(
        !h.verify("wrong horse".into(), Some(hash.clone()))
            .await
            .unwrap()
    );
    assert!(
        !h.verify("correct horse".into(), None).await.unwrap(),
        "no such user"
    );
    assert!(
        !h.verify("correct horse".into(), Some("not a hash".into()))
            .await
            .unwrap(),
        "unparseable hash"
    );
    assert_ne!(
        h.hash("correct horse".into()).await.unwrap(),
        hash,
        "hashes are salted"
    );
}
