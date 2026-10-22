use std::sync::{
    LazyLock,
    atomic::{AtomicU64, Ordering},
};

use anyhow::anyhow;
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};

use crate::error::AppResult;

/// How many argon2 operations (hash or verify) ran in this process. Lets a test prove that a request was refused
/// before any hashing work, without timing it. Only meaningful when no other test shares the process.
pub fn work_count() -> u64 {
    WORK.load(Ordering::SeqCst)
}

static WORK: AtomicU64 = AtomicU64::new(0);

/// Hashes on a blocking thread (argon2 is deliberately slow).
pub async fn hash(password: String) -> AppResult<String> {
    WORK.fetch_add(1, Ordering::SeqCst);
    let phc = tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|h| h.to_string())
    })
    .await
    .map_err(|e| anyhow!(e))?
    .map_err(|e| anyhow!("hash password: {e}"))?;
    Ok(phc)
}

/// Verifies against `phc`, or against a dummy hash when the user does not exist so timing does not reveal it.
pub async fn verify(password: String, phc: Option<String>) -> AppResult<bool> {
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
    .map_err(|e| anyhow!(e))?;
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
