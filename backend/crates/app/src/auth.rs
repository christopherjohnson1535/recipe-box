use std::sync::Arc;

use domain::{
    DomainError, DomainResult, User,
    chrono::{DateTime, Duration, Utc},
    uuid::Uuid,
    validate,
};
use ports::{Clock, PasswordHasher, SessionRepo, SessionTokens, UserRepo};

use crate::Deps;

/// The one answer for an unknown user, a wrong password and a password that can never have been set.
pub(crate) const WRONG_LOGIN: DomainError =
    DomainError::Unauthenticated("Wrong username or password.");

/// A session just started: `token` goes in the cookie (it is not stored), valid until `expires_at`, which is
/// `lifetime` from now (the cookie's Max-Age).
#[derive(Debug, Clone)]
pub struct NewSession {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub lifetime: Duration,
}

/// Sign-in, sign-out and session lookup.
#[derive(Clone)]
pub struct AuthService {
    users: Arc<dyn UserRepo>,
    sessions: Arc<dyn SessionRepo>,
    hasher: Arc<dyn PasswordHasher>,
    tokens: Arc<dyn SessionTokens>,
    clock: Arc<dyn Clock>,
    session_days: i64,
}

impl AuthService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            users: d.users.clone(),
            sessions: d.sessions.clone(),
            hasher: d.hasher.clone(),
            tokens: d.tokens.clone(),
            clock: d.clock.clone(),
            session_days: d.session_days,
        }
    }

    /// Unknown user and wrong password give the same answer (and the same hashing work). A password over
    /// `MAX_PASSWORD` characters can never have been set, so it is refused before any hashing.
    pub async fn login(
        &self,
        username: &str,
        password: String,
    ) -> DomainResult<(User, NewSession)> {
        if password.chars().count() > validate::MAX_PASSWORD {
            return Err(WRONG_LOGIN);
        }
        let (user, hash) = match self.users.find_with_hash(username.trim()).await? {
            Some((user, hash)) => (Some(user), Some(hash)),
            None => (None, None),
        };
        let ok = self.hasher.verify(password, hash).await?;
        let Some(user) = user.filter(|_| ok) else {
            return Err(WRONG_LOGIN);
        };
        let session = self.start_session(user.id).await?;
        Ok((user, session))
    }

    /// Starts a session for an existing user, valid for `session_days`.
    pub async fn start_session(&self, user_id: Uuid) -> DomainResult<NewSession> {
        let token = self.tokens.generate();
        let lifetime = Duration::days(self.session_days);
        let expires_at = self.clock.now() + lifetime;
        self.sessions
            .create(user_id, self.tokens.digest(&token), expires_at)
            .await?;
        Ok(NewSession {
            token,
            expires_at,
            lifetime,
        })
    }

    /// Ends the session behind `token`, if there is one. Never fails for a missing session.
    pub async fn logout(&self, token: Option<&str>) -> DomainResult<()> {
        match token {
            Some(t) => self.sessions.delete(&self.tokens.digest(t)).await,
            None => Ok(()),
        }
    }

    /// The user behind a live session token.
    pub async fn current_user(&self, token: &str) -> DomainResult<Option<User>> {
        self.sessions
            .user_for_token(&self.tokens.digest(token))
            .await
    }

    pub(crate) fn digest(&self, token: &str) -> Vec<u8> {
        self.tokens.digest(token)
    }
}
