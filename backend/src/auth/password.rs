use std::sync::{
    LazyLock,
    atomic::{AtomicU64, Ordering},
};

use argon2::{
    Argon2,
    password_hash::{PasswordHasher as _, PasswordVerifier, phc::PasswordHash},
};
use async_trait::async_trait;
use domain::{DomainError, DomainResult};
use ports::PasswordHasher;

/// How many argon2 operations (hash or verify) ran in this process. Lets a test prove that a request was refused
/// before any hashing work, without timing it. Only meaningful when no other test shares the process.
pub fn work_count() -> u64 {
    WORK.load(Ordering::SeqCst)
}

static WORK: AtomicU64 = AtomicU64::new(0);

/// argon2id with the crate's default parameters.
pub struct Argon2Hasher;

#[async_trait]
impl PasswordHasher for Argon2Hasher {
    async fn hash(&self, password: String) -> DomainResult<String> {
        hash(password).await
    }

    async fn verify(&self, password: String, hash: Option<String>) -> DomainResult<bool> {
        verify(password, hash).await
    }
}

/// Hashes on a blocking thread (argon2 is deliberately slow).
async fn hash(password: String) -> DomainResult<String> {
    WORK.fetch_add(1, Ordering::SeqCst);
    let phc = tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|h| h.to_string())
    })
    .await
    .map_err(|e| DomainError::Internal(e.to_string()))?
    .map_err(|e| DomainError::Internal(format!("hash password: {e}")))?;
    Ok(phc)
}

/// Verifies against `phc`, or against a dummy hash when the user does not exist so timing does not reveal it.
async fn verify(password: String, phc: Option<String>) -> DomainResult<bool> {
    WORK.fetch_add(1, Ordering::SeqCst);
    static DUMMY: LazyLock<String> = LazyLock::new(|| {
        Argon2::default()
            .hash_password(b"dummy password for timing")
            .expect("hash dummy password")
            .to_string()
    });
    let ok = tokio::task::spawn_blocking(move || {
        let known = phc.is_some();
        let phc = phc.unwrap_or_else(|| DUMMY.clone());
        let Ok(parsed) = PasswordHash::new(&phc) else {
            return false;
        };
        let matches = Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok();
        known && matches
    })
    .await
    .map_err(|e| DomainError::Internal(e.to_string()))?;
    Ok(ok)
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn hash_and_verify() {
        let phc = super::hash("correct horse".into()).await.unwrap();
        assert!(
            super::verify("correct horse".into(), Some(phc.clone()))
                .await
                .unwrap()
        );
        assert!(
            !super::verify("wrong horse".into(), Some(phc))
                .await
                .unwrap()
        );
        assert!(!super::verify("correct horse".into(), None).await.unwrap());
    }
}
