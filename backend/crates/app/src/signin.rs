//! Sign in with Google for existing members (ACC-6). Google only says who someone is: this decides which member that
//! is, and never makes one. The flow runs entirely here (confidential client, PKCE); what must survive the trip to
//! Google rides in a sealed cookie, so no server-side state is needed.

use std::sync::Arc;

use domain::{
    DomainError, DomainResult, Identity, NewIdentity, PROVIDER_GOOGLE, Secret, SignInFlow,
    chrono::Duration, constant_time_eq, url::Url, uuid::Uuid, validate,
};
use ports::{Clock, FlowSealer, GoogleSignIn, IdentityRepo, SessionTokens, UserRepo};

use crate::{Deps, auth::AuthService, auth::NewSession};

/// How long a started sign-in may take; an older one is refused even if the browser still holds its cookie.
pub const FLOW_MAX_AGE: Duration = Duration::minutes(10);

/// Where a link made from Settings ends.
const SETTINGS: &str = "/settings";

/// A sign-in just started: send the browser to `url` and keep `flow` in the `rb_oauth` cookie.
#[derive(Debug)]
pub struct Started {
    pub url: Url,
    /// The sealed flow, safe to put in a cookie.
    pub flow: String,
}

/// What Google's redirect carried.
#[derive(Debug, Default, Clone, Copy)]
pub struct Callback<'a> {
    pub code: Option<&'a str>,
    pub state: Option<&'a str>,
    /// Set by Google when the person said no (`access_denied`).
    pub error: Option<&'a str>,
}

/// How a returning browser is to be treated.
#[derive(Debug)]
pub enum SignInOutcome {
    /// A member signed in: start their session, then go to `next` (a path on this site).
    SignedIn { session: NewSession, next: String },
    /// Google vouched for someone who is no member. Nothing was created.
    NotMember,
    /// Link mode: the Google account is now linked to the signed-in member.
    Linked,
    /// Link mode: that Google account is linked to another member.
    Taken,
    /// Anything else. `link` says whether it was a link from Settings. `error` is why, for the log; it never holds a
    /// token or a code.
    Failed {
        link: bool,
        error: Option<DomainError>,
    },
}

#[derive(Clone)]
pub struct SignInService {
    google: Arc<dyn GoogleSignIn>,
    users: Arc<dyn UserRepo>,
    identities: Arc<dyn IdentityRepo>,
    flows: Arc<dyn FlowSealer>,
    tokens: Arc<dyn SessionTokens>,
    clock: Arc<dyn Clock>,
    auth: AuthService,
}

impl SignInService {
    pub(crate) fn new(d: &Deps, auth: AuthService) -> Self {
        Self {
            google: d.google_signin.clone(),
            users: d.users.clone(),
            identities: d.identities.clone(),
            flows: d.flows.clone(),
            tokens: d.tokens.clone(),
            clock: d.clock.clone(),
            auth,
        }
    }

    /// Whether the server has a Google OAuth client (`GET /api/auth/providers`).
    pub fn enabled(&self) -> bool {
        self.google.configured()
    }

    /// `NotFound` when the server has no Google OAuth client: the sign-in routes then do not exist.
    pub fn ensure_enabled(&self) -> DomainResult<()> {
        if self.enabled() {
            Ok(())
        } else {
            Err(DomainError::NotFound(
                "Google sign-in is not set up on this server.".into(),
            ))
        }
    }

    /// Starts a sign-in, or with `link_user` a link of a Google account to that signed-in member. `next` is where
    /// a sign-in ends; anything but a path on this site becomes `/`. `NotFound` when Google is not set up.
    pub fn start(&self, next: Option<&str>, link_user: Option<Uuid>) -> DomainResult<Started> {
        self.ensure_enabled()?;
        let secret = || Secret::new(self.tokens.generate());
        let flow = SignInFlow {
            state: secret(),
            nonce: secret(),
            code_verifier: secret(),
            next: if link_user.is_some() {
                SETTINGS.into()
            } else {
                validate::next_path(next)
            },
            link_user,
            issued_at: self.clock.now(),
        };
        let url = self.google.authorize_url(
            flow.state.expose(),
            flow.nonce.expose(),
            flow.code_verifier.expose(),
        )?;
        Ok(Started {
            url,
            flow: self.flows.seal(&flow)?,
        })
    }

    /// Finishes what [`SignInService::start`] began. `cookie` is the `rb_oauth` value, `signed_in` the member whose
    /// session the request carries, if any (needed for a link: it must be the member who started it). Every
    /// failure is an outcome; only a server without Google is an error (`NotFound`).
    pub async fn finish(
        &self,
        cookie: Option<&str>,
        reply: Callback<'_>,
        signed_in: Option<Uuid>,
    ) -> DomainResult<SignInOutcome> {
        self.ensure_enabled()?;
        let flow = match self.open_flow(cookie, reply.state) {
            Ok(flow) => flow,
            Err(error) => {
                return Ok(SignInOutcome::Failed {
                    link: false,
                    error: Some(error),
                });
            }
        };
        let link = flow.link_user.is_some();
        Ok(match self.complete(flow, reply, signed_in).await {
            Ok(outcome) => outcome,
            Err(error) => SignInOutcome::Failed {
                link,
                error: Some(error),
            },
        })
    }

    /// The flow behind the cookie, if the cookie is ours, young enough, and `state` is the one sent to Google.
    fn open_flow(&self, cookie: Option<&str>, state: Option<&str>) -> DomainResult<SignInFlow> {
        let refused = |why: &str| DomainError::validation(format!("sign-in refused: {why}"));
        let flow = self
            .flows
            .open(cookie.ok_or_else(|| refused("no sign-in in progress"))?)
            .map_err(|_| refused("unreadable sign-in record"))?;
        if self.clock.now() - flow.issued_at > FLOW_MAX_AGE {
            return Err(refused("sign-in took too long"));
        }
        match state {
            Some(got) if constant_time_eq(got, flow.state.expose()) => Ok(flow),
            _ => Err(refused("state does not match")),
        }
    }

    async fn complete(
        &self,
        flow: SignInFlow,
        reply: Callback<'_>,
        signed_in: Option<Uuid>,
    ) -> DomainResult<SignInOutcome> {
        if let Some(link_user) = flow.link_user
            && signed_in != Some(link_user)
        {
            return Err(DomainError::Forbidden(
                "A link must be finished by the member who started it.".into(),
            ));
        }
        if reply.error.is_some() {
            return Err(DomainError::Google(
                "Google did not sign the person in.".into(),
            ));
        }
        let code = reply
            .code
            .filter(|c| !c.is_empty())
            .ok_or_else(|| DomainError::Google("Google sent no code.".into()))?;
        let account = self
            .google
            .account(code, flow.nonce.expose(), &flow.code_verifier)
            .await?;
        if !account.email_verified {
            return Err(DomainError::Google(
                "Google has not verified the email address of this account.".into(),
            ));
        }
        match flow.link_user {
            Some(user_id) => self.link(user_id, account.subject, account.email).await,
            None => {
                self.sign_in(flow.next, account.subject, account.email)
                    .await
            }
        }
    }

    /// An existing link signs in its member (whatever their email is now); else a member whose email is the verified
    /// one is linked and signed in; else nobody.
    async fn sign_in(
        &self,
        next: String,
        subject: String,
        email: String,
    ) -> DomainResult<SignInOutcome> {
        let user = match self.identities.find(PROVIDER_GOOGLE, &subject).await? {
            Some(link) => self.users.find(link.user_id).await?,
            None => match self.users.find_by_email(&email).await? {
                Some(user) => {
                    self.identities
                        .create(NewIdentity {
                            user_id: user.id,
                            provider: PROVIDER_GOOGLE.into(),
                            subject,
                            email,
                        })
                        .await?;
                    Some(user)
                }
                None => return Ok(SignInOutcome::NotMember),
            },
        };
        let user = user.ok_or_else(|| DomainError::Internal("a link without a member".into()))?;
        let session = self.auth.start_session(user.id).await?;
        Ok(SignInOutcome::SignedIn { session, next })
    }

    async fn link(
        &self,
        user_id: Uuid,
        subject: String,
        email: String,
    ) -> DomainResult<SignInOutcome> {
        if let Some(existing) = self.identities.find(PROVIDER_GOOGLE, &subject).await? {
            return Ok(if existing.user_id == user_id {
                SignInOutcome::Linked
            } else {
                SignInOutcome::Taken
            });
        }
        let made = self
            .identities
            .create(NewIdentity {
                user_id,
                provider: PROVIDER_GOOGLE.into(),
                subject,
                email,
            })
            .await;
        match made {
            Ok(_) => Ok(SignInOutcome::Linked),
            // Linked by someone else in the meantime.
            Err(DomainError::Conflict(_)) => Ok(SignInOutcome::Taken),
            Err(e) => Err(e),
        }
    }

    /// The member's linked accounts, oldest first.
    pub async fn identities(&self, user_id: Uuid) -> DomainResult<Vec<Identity>> {
        self.identities.list(user_id).await
    }

    /// Removes the member's own link. `NotFound` when it is not theirs or not there.
    pub async fn unlink(&self, user_id: Uuid, id: Uuid) -> DomainResult<()> {
        self.identities.delete(user_id, id).await
    }
}
