use std::sync::Arc;

use domain::{DomainError, DomainResult, NewUser, ROLE_ADMIN, User, uuid::Uuid, validate};
use ports::{PasswordHasher, UserRepo};

use crate::{
    Deps,
    auth::{AuthService, NewSession, WRONG_LOGIN},
};

/// Household members: first-run setup, admin management, password changes.
#[derive(Clone)]
pub struct UserService {
    users: Arc<dyn UserRepo>,
    hasher: Arc<dyn PasswordHasher>,
    auth: AuthService,
}

impl UserService {
    pub(crate) fn new(d: &Deps, auth: AuthService) -> Self {
        Self {
            users: d.users.clone(),
            hasher: d.hasher.clone(),
            auth,
        }
    }

    /// Whether the first admin still has to be created.
    pub async fn needs_setup(&self) -> DomainResult<bool> {
        Ok(!self.users.any().await?)
    }

    /// Creates the first admin and signs them in. `Forbidden` once any user exists.
    pub async fn create_first_admin(
        &self,
        username: &str,
        display_name: &str,
        password: String,
    ) -> DomainResult<(User, NewSession)> {
        let new = self
            .new_user(username, display_name, password, ROLE_ADMIN)
            .await?;
        let user = self.users.create_first_admin(new).await?;
        let session = self.auth.start_session(user.id).await?;
        Ok((user, session))
    }

    pub async fn list(&self) -> DomainResult<Vec<User>> {
        self.users.list().await
    }

    /// `role` is `admin` or `member`. The caller's admin check is the HTTP layer's (an extractor).
    pub async fn create(
        &self,
        username: &str,
        display_name: &str,
        password: String,
        role: &str,
    ) -> DomainResult<User> {
        let new = self
            .new_user(username, display_name, password, role)
            .await?;
        self.users.create(new).await
    }

    /// Validates in the order username, display name, password, role; then hashes.
    async fn new_user(
        &self,
        username: &str,
        display_name: &str,
        password: String,
        role: &str,
    ) -> DomainResult<NewUser> {
        let username = validate::username(username)?;
        let display_name = validate::display_name(display_name)?;
        validate::password(&password)?;
        if !matches!(role, "admin" | "member") {
            return Err(DomainError::validation("role: `admin` or `member`."));
        }
        Ok(NewUser {
            username,
            display_name,
            password_hash: self.hasher.hash(password).await?,
            role: role.into(),
        })
    }

    /// Removes a user (admin only, checked by the caller). Not yourself; the repository refuses the last admin.
    pub async fn remove(&self, caller: &User, id: Uuid) -> DomainResult<()> {
        if id == caller.id {
            return Err(DomainError::Forbidden("You can't remove yourself.".into()));
        }
        self.users.remove(id).await
    }

    /// Changes a user's password and ends their sessions, keeping `caller_token`'s only on an own change.
    ///
    /// Checks, in order: a member changing someone else's (`Forbidden`), the new password's rules, the user
    /// existing (`NotFound`), and for an own change the current password (`Unauthenticated`, an over-long one
    /// without hashing). An admin resetting another user's needs no current password. If the stored hash changed
    /// after it was verified, an own change is `Unauthenticated` too: to the caller it is a wrong current password.
    pub async fn set_password(
        &self,
        caller: &User,
        id: Uuid,
        new: String,
        current: Option<String>,
        caller_token: Option<&str>,
    ) -> DomainResult<()> {
        let own = id == caller.id;
        if !own && !caller.is_admin() {
            return Err(DomainError::Forbidden("Only an admin can do that.".into()));
        }
        validate::password(&new)?;
        let Some(stored) = self.users.password_hash(id).await? else {
            return Err(DomainError::NotFound("No such user.".into()));
        };
        if own {
            let given = current.unwrap_or_default();
            if given.chars().count() > validate::MAX_PASSWORD
                || !self.hasher.verify(given, Some(stored.clone())).await?
            {
                return Err(WRONG_LOGIN);
            }
        }
        let hash = self.hasher.hash(new).await?;
        let keep = own
            .then(|| caller_token.map(|t| self.auth.digest(t)))
            .flatten();
        // The hash the caller verified against must still be the stored one; an admin reset checks nothing.
        match self
            .users
            .set_password_hash(id, &hash, own.then_some(stored.as_str()), keep.as_deref())
            .await
        {
            Err(DomainError::Conflict(_)) if own => Err(WRONG_LOGIN),
            r => r,
        }
    }
}
