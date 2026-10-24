//! Cases for the media store and the password hasher.

use domain::DomainError;

use crate::{MediaStore, PasswordHasher, StorageHealth};

/// A storage that answers must ping fine.
pub async fn storage_health(h: &dyn StorageHealth) {
    h.ping().await.expect("a working storage answers its ping");
}

/// `make` gives a new, empty store each time it is called.
pub async fn media_store<M: MediaStore>(make: impl Fn() -> M) {
    let m = make();
    const A: &str = "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.jpg";
    const B: &str = "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e50.display.jpg";
    assert_eq!(m.get(A).await.unwrap(), None, "nothing stored yet");
    m.put(A, vec![1, 2, 3]).await.unwrap();
    assert_eq!(m.get(A).await.unwrap(), Some(vec![1, 2, 3]));
    m.put(A, vec![9]).await.unwrap();
    assert_eq!(m.get(A).await.unwrap(), Some(vec![9]), "put replaces");
    m.put(B, vec![]).await.unwrap();
    assert_eq!(
        m.get(B).await.unwrap(),
        Some(vec![]),
        "an empty blob is not a missing one"
    );
    m.delete(A).await.unwrap();
    assert_eq!(m.get(A).await.unwrap(), None);
    assert!(m.get(B).await.unwrap().is_some(), "other blobs stay");
    m.delete(A).await.expect("deleting a missing blob is fine");

    // The name rule is part of the contract: `^[0-9a-f-]{36}(\.display)?\.jpg$`, nothing else.
    let id = "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f";
    let upper = format!("{}.jpg", id.to_uppercase());
    let png = format!("{id}.png");
    let twice = format!("{id}.display.display.jpg");
    let nul = format!("{id}\0.jpg");
    let traversal = format!("../{id}.jpg");
    let nested = format!("dir/{id}.jpg");
    let windows = format!("dir\\{id}.jpg");
    for bad in [
        "", ".", "..", ".jpg", "a b", "a\0", "C:x", "a.jpg", &upper, &png, &twice, &nul,
        &traversal, &nested, &windows,
    ] {
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
