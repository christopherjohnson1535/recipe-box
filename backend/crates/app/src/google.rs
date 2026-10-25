//! Sending the grocery list to the member's own Google Tasks (GRO-5). Google, the token cipher and the connection
//! store are ports; this decides what to send and what a refused token means.

use std::sync::Arc;

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Secret, SignInFlow,
    chrono::{DateTime, Duration, Utc},
    grocery::{Section, item_title},
    url::Url,
    uuid::Uuid,
};
use ports::{
    Clock, FlowSealer, GoogleAccount, GoogleConnectionRepo, GoogleSignIn, GoogleTasks,
    SessionTokens, TaskSection, TokenCipher,
};

use crate::{Deps, GroceryService};

/// The title of the Google Tasks list the grocery list is sent to.
pub const TASK_LIST_TITLE: &str = "Groceries";

/// A running export older than this is taken to have died without letting go of its lease. The Google adapter gives
/// up on a send well before.
const EXPORT_LEASE: Duration = Duration::minutes(2);

/// `GoogleTasks` for a server without a Google OAuth client: every call but `configured` says so.
pub struct DisabledGoogleTasks;

#[async_trait]
impl GoogleTasks for DisabledGoogleTasks {
    fn configured(&self) -> bool {
        false
    }

    fn consent_url(&self, _: &str) -> DomainResult<Url> {
        Err(DomainError::GoogleDisabled)
    }

    async fn exchange_code(&self, _: &str) -> DomainResult<Secret> {
        Err(DomainError::GoogleDisabled)
    }

    async fn access_token(&self, _: &Secret) -> DomainResult<Secret> {
        Err(DomainError::GoogleDisabled)
    }

    async fn revoke(&self, _: &Secret) -> DomainResult<()> {
        Err(DomainError::GoogleDisabled)
    }

    async fn ensure_list(&self, _: &Secret, _: Option<&str>, _: &str) -> DomainResult<String> {
        Err(DomainError::GoogleDisabled)
    }

    async fn fill_list(&self, _: &Secret, _: &str, _: &[TaskSection]) -> DomainResult<()> {
        Err(DomainError::GoogleDisabled)
    }
}

/// `GoogleSignIn` and `FlowSealer` for a server without a Google OAuth client.
pub struct DisabledGoogleSignIn;

#[async_trait]
impl GoogleSignIn for DisabledGoogleSignIn {
    fn configured(&self) -> bool {
        false
    }

    fn authorize_url(&self, _: &str, _: &str, _: &str) -> DomainResult<Url> {
        Err(DomainError::GoogleDisabled)
    }

    async fn account(&self, _: &str, _: &str, _: &Secret) -> DomainResult<GoogleAccount> {
        Err(DomainError::GoogleDisabled)
    }
}

impl FlowSealer for DisabledGoogleSignIn {
    fn seal(&self, _: &SignInFlow) -> DomainResult<String> {
        Err(DomainError::GoogleDisabled)
    }

    fn open(&self, _: &str) -> DomainResult<SignInFlow> {
        Err(DomainError::GoogleDisabled)
    }
}

/// `GET /api/integrations/google`.
#[derive(Debug, Clone, PartialEq)]
pub struct GoogleStatus {
    pub configured: bool,
    pub connected: bool,
    pub connected_at: Option<DateTime<Utc>>,
}

/// What an export sent: parent tasks (non-empty sections) and subtasks (items).
#[derive(Debug, Clone, PartialEq)]
pub struct GoogleExport {
    pub task_list_title: String,
    pub sections: usize,
    pub items: usize,
}

#[derive(Clone)]
pub struct GoogleTasksService {
    google: Arc<dyn GoogleTasks>,
    connections: Arc<dyn GoogleConnectionRepo>,
    cipher: Arc<dyn TokenCipher>,
    tokens: Arc<dyn SessionTokens>,
    clock: Arc<dyn Clock>,
    grocery: GroceryService,
}

impl GoogleTasksService {
    pub(crate) fn new(d: &Deps, grocery: GroceryService) -> Self {
        Self {
            google: d.google.clone(),
            connections: d.google_connections.clone(),
            cipher: d.cipher.clone(),
            tokens: d.tokens.clone(),
            clock: d.clock.clone(),
            grocery,
        }
    }

    fn enabled(&self) -> DomainResult<()> {
        if self.google.configured() {
            Ok(())
        } else {
            Err(DomainError::GoogleDisabled)
        }
    }

    pub async fn status(&self, user_id: Uuid) -> DomainResult<GoogleStatus> {
        let configured = self.google.configured();
        let connection = if configured {
            self.connections.get(user_id).await?
        } else {
            None
        };
        // Connected means a token is stored; a row without one only remembers the task list.
        let connection = connection.filter(|c| c.sealed_token.is_some());
        Ok(GoogleStatus {
            configured,
            connected: connection.is_some(),
            connected_at: connection.map(|c| c.connected_at),
        })
    }

    /// Where to send the browser, and the random `state` to remember in a cookie and compare on the way back.
    pub fn consent(&self) -> DomainResult<(Url, String)> {
        self.enabled()?;
        let state = self.tokens.generate();
        Ok((self.google.consent_url(&state)?, state))
    }

    /// Stores the refresh token the `code` of Google's redirect is worth, sealed, for `user_id`. A token it
    /// replaces is only discarded, never revoked: Google's revoke ends the app's whole grant for that Google
    /// account, which would also end the token just issued.
    pub async fn finish(&self, user_id: Uuid, code: &str) -> DomainResult<()> {
        self.enabled()?;
        let refresh = self.google.exchange_code(code).await?;
        let sealed = self.cipher.seal(&refresh)?;
        self.connections
            .upsert(user_id, sealed, self.clock.now())
            .await
    }

    /// Revokes the token at Google and forgets the connection. The connection goes even when revoking fails (or
    /// cannot be tried); that failure is returned for the caller to log.
    pub async fn disconnect(&self, user_id: Uuid) -> DomainResult<Option<DomainError>> {
        let Some(connection) = self.connections.get(user_id).await? else {
            return Ok(None);
        };
        let revoked = match connection.sealed_token {
            Some(sealed) => match self.cipher.open(&sealed) {
                Ok(token) => self.google.revoke(&token).await,
                Err(e) => Err(e),
            },
            None => Ok(()),
        };
        self.connections.delete(user_id).await?;
        Ok(revoked.err())
    }

    /// Replaces the contents of the member's `Groceries` task list with the current grocery list: unticked items
    /// only, staples only with `include_staples`, one parent task per non-empty section in store order. One send per
    /// member at a time (`Conflict` otherwise).
    pub async fn export(&self, user_id: Uuid, include_staples: bool) -> DomainResult<GoogleExport> {
        self.enabled()?;
        let connection = self
            .connections
            .get(user_id)
            .await?
            .ok_or(DomainError::GoogleNotConnected)?;
        let sealed = connection
            .sealed_token
            .as_deref()
            .ok_or(DomainError::GoogleNotConnected)?;
        // A token that will not open (the key changed) is not a dead token: keep it, so putting the key back works.
        let refresh = self
            .cipher
            .open(sealed)
            .map_err(|_| DomainError::GoogleNotConnected)?;

        let now = self.clock.now();
        if !self
            .connections
            .claim_export(user_id, now, now - EXPORT_LEASE)
            .await?
        {
            return Err(DomainError::Conflict(
                "A send to Google Tasks is already running.".into(),
            ));
        }
        let sent = self
            .send(
                user_id,
                &refresh,
                connection.tasklist_id.as_deref(),
                include_staples,
            )
            .await;
        let released = self.connections.release_export(user_id).await;
        let sent = sent?;
        released?;
        Ok(sent)
    }

    async fn send(
        &self,
        user_id: Uuid,
        refresh: &Secret,
        known_list: Option<&str>,
        include_staples: bool,
    ) -> DomainResult<GoogleExport> {
        let access = match self.google.access_token(refresh).await {
            Err(e @ DomainError::GoogleNotConnected) => {
                // Google no longer accepts the token (revoked, expired): forget it, keep the task list, offer to
                // reconnect.
                self.connections.forget_token(user_id).await?;
                return Err(e);
            }
            other => other?,
        };

        let list = self.grocery.get().await?;
        let sections: Vec<TaskSection> = Section::ALL
            .into_iter()
            .filter_map(|section| {
                let items: Vec<String> = list
                    .items
                    .iter()
                    .filter(|i| i.item.section == section && !i.item.checked)
                    .filter(|i| include_staples || !i.staple)
                    .map(|i| item_title(&i.item.amounts, &i.item.name))
                    .collect();
                (!items.is_empty()).then(|| TaskSection {
                    title: section.title().to_string(),
                    items,
                })
            })
            .collect();

        // The list is remembered before it is filled: a send that fails half way is picked up by the next one
        // instead of leaving a half-filled list behind and making another.
        let id = self
            .google
            .ensure_list(&access, known_list, TASK_LIST_TITLE)
            .await?;
        if known_list != Some(id.as_str()) {
            self.connections.set_tasklist(user_id, &id).await?;
        }
        self.google.fill_list(&access, &id, &sections).await?;
        Ok(GoogleExport {
            task_list_title: TASK_LIST_TITLE.to_string(),
            sections: sections.len(),
            items: sections.iter().map(|s| s.items.len()).sum(),
        })
    }
}
