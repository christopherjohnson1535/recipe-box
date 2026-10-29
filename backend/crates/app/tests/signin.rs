//! Sign in with Google (ACC-6) over the in-memory adapters and a scripted Google: who gets in, who does not, and what
//! a link from Settings does. The OpenID checks themselves (signature, audience, nonce, ...) belong to the Google
//! adapter and are tested over HTTP against a fake identity provider in `backend/tests/google_sign_in.rs`.

#[allow(dead_code)] // shared with the other test files
mod common;

use std::sync::{Arc, Mutex};

use adapter_memory::{
    FakeFlowSealer, FakeImageCodec, FakePasswordHasher, FakeSessionTokens, FakeTokenCipher,
    MemoryBackup, MemoryMedia, MemoryStore,
};
use app::{
    Callback, Deps, DisabledGoogleSignIn, DisabledGoogleTasks, NoneExtractor, Services,
    SignInOutcome, Throttle,
};
use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, PROVIDER_GOOGLE, Secret, User, chrono::Duration, url::Url,
    uuid::Uuid,
};
use ports::{GoogleAccount, GoogleSignIn, IdentityRepo, contract::ManualClock};

/// Google, scripted: it answers `account` with `reply` and records what it was asked.
struct FakeSignIn {
    reply: Mutex<Result<GoogleAccount, String>>,
    /// `(code, nonce, verifier)` of every `account` call.
    asked: Mutex<Vec<(String, String, String)>>,
}

impl FakeSignIn {
    fn says(&self, subject: &str, email: &str, verified: bool) {
        *self.reply.lock().unwrap() = Ok(GoogleAccount {
            subject: subject.into(),
            email: email.into(),
            email_verified: verified,
        });
    }
}

#[async_trait]
impl GoogleSignIn for FakeSignIn {
    fn configured(&self) -> bool {
        true
    }

    fn authorize_url(&self, state: &str, nonce: &str, verifier: &str) -> DomainResult<Url> {
        Ok(Url::parse(&format!(
            "https://accounts.example/auth?state={state}&nonce={nonce}&challenge-of={verifier}"
        ))
        .unwrap())
    }

    async fn account(
        &self,
        code: &str,
        nonce: &str,
        verifier: &Secret,
    ) -> DomainResult<GoogleAccount> {
        self.asked
            .lock()
            .unwrap()
            .push((code.into(), nonce.into(), verifier.expose().into()));
        self.reply
            .lock()
            .unwrap()
            .clone()
            .map_err(DomainError::Google)
    }
}

struct World {
    clock: Arc<ManualClock>,
    store: Arc<MemoryStore>,
    google: Arc<FakeSignIn>,
    services: Services,
}

impl World {
    fn new() -> Self {
        let google = Arc::new(FakeSignIn {
            reply: Mutex::new(Err("not scripted".into())),
            asked: Mutex::default(),
        });
        Self::build(google.clone(), google)
    }

    /// A server without a Google OAuth client.
    fn disabled() -> Self {
        let google = Arc::new(FakeSignIn {
            reply: Mutex::new(Err("not scripted".into())),
            asked: Mutex::default(),
        });
        Self::build(Arc::new(DisabledGoogleSignIn), google)
    }

    fn build(port: Arc<dyn GoogleSignIn>, google: Arc<FakeSignIn>) -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let services = Services::new(Self::deps(&port, &store, &clock, store.clone()));
        Self {
            clock,
            store,
            google,
            services,
        }
    }

    fn deps(
        port: &Arc<dyn GoogleSignIn>,
        store: &Arc<MemoryStore>,
        clock: &Arc<ManualClock>,
        identities: Arc<dyn IdentityRepo>,
    ) -> Deps {
        Deps {
            recipes: store.clone(),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            google_connections: store.clone(),
            identities,
            cook_log: store.clone(),
            favourites: store.clone(),
            google_signin: port.clone(),
            flows: Arc::new(FakeFlowSealer::default()),
            health: store.clone(),
            media: Arc::new(MemoryMedia::default()),
            backup: Arc::new(MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock: clock.clone(),
            extractor: Arc::new(NoneExtractor),
            fetcher: Arc::new(common::FakeFetcher::default()),
            reader: Arc::new(common::FakeReader::default()),
            google: Arc::new(DisabledGoogleTasks),
            cipher: Arc::new(FakeTokenCipher),
            spawner: Arc::new(common::CollectingSpawner::default()),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: Throttle::new(),
        }
    }

    /// The same world with its own link store (to script a race).
    fn services_with_identities(&self, identities: Arc<dyn IdentityRepo>) -> Services {
        let port: Arc<dyn GoogleSignIn> = self.google.clone();
        Services::new(Self::deps(&port, &self.store, &self.clock, identities))
    }

    async fn member(&self, name: &str, email: Option<&str>) -> User {
        self.services
            .users
            .create(name, name, "a long enough password".into(), "member", email)
            .await
            .unwrap()
    }

    /// Starts a sign-in and returns the cookie and the `state` Google would send back.
    fn start(&self, next: Option<&str>) -> (String, String) {
        let started = self.services.signin.start(next, None).unwrap();
        (started.flow, query_of(&started.url, "state"))
    }

    fn start_link(&self, user: Uuid) -> (String, String) {
        let started = self
            .services
            .signin
            .start(Some("/ignored"), Some(user))
            .unwrap();
        (started.flow, query_of(&started.url, "state"))
    }

    /// Google's redirect arrives with `code` and `state`.
    async fn back(&self, cookie: &str, state: &str, signed_in: Option<Uuid>) -> SignInOutcome {
        let reply = Callback {
            code: Some("the-code"),
            state: Some(state),
            error: None,
        };
        self.services
            .signin
            .finish(Some(cookie), reply, signed_in, None)
            .await
            .unwrap()
    }

    fn google_was_asked(&self) -> usize {
        self.google.asked.lock().unwrap().len()
    }

    async fn link_of(&self, subject: &str) -> Option<domain::Identity> {
        IdentityRepo::find(&*self.store, PROVIDER_GOOGLE, subject)
            .await
            .unwrap()
    }

    async fn user_count(&self) -> usize {
        self.services.users.list().await.unwrap().len()
    }
}

fn query_of(url: &Url, key: &str) -> String {
    url.query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .unwrap_or_else(|| panic!("{key} in {url}"))
}

#[track_caller]
fn assert_failed(outcome: &SignInOutcome, link: bool) {
    assert!(
        matches!(outcome, SignInOutcome::Failed { link: l, .. } if *l == link),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn without_google_nothing_starts_and_nothing_finishes() {
    let w = World::disabled();
    assert!(!w.services.signin.enabled());
    assert!(matches!(
        w.services.signin.start(None, None),
        Err(DomainError::NotFound(_))
    ));
    let reply = Callback {
        code: Some("c"),
        state: Some("s"),
        error: None,
    };
    assert!(matches!(
        w.services
            .signin
            .finish(Some("flow-0"), reply, None, None)
            .await,
        Err(DomainError::NotFound(_))
    ));
}

#[tokio::test]
async fn a_start_sends_fresh_secrets_to_google_and_keeps_them_sealed() {
    let w = World::new();
    assert!(w.services.signin.enabled());
    let a = w.services.signin.start(None, None).unwrap();
    let b = w.services.signin.start(None, None).unwrap();
    let (sa, na, va) = (
        query_of(&a.url, "state"),
        query_of(&a.url, "nonce"),
        query_of(&a.url, "challenge-of"),
    );
    assert_ne!(sa, query_of(&b.url, "state"));
    assert!(sa != na && na != va && sa != va, "three different secrets");
    assert_ne!(a.flow, b.flow);
    assert!(!a.flow.contains(&sa), "the cookie does not show the state");
}

#[tokio::test]
async fn an_unknown_google_account_gets_in_nowhere_and_nothing_is_created() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-stranger", "stranger@example.com", true);
    let (cookie, state) = w.start(None);
    let out = w.back(&cookie, &state, None).await;
    assert!(matches!(out, SignInOutcome::NotMember), "{out:?}");
    assert_eq!(w.user_count().await, 1);
    assert!(w.link_of("sub-stranger").await.is_none());
}

#[tokio::test]
async fn a_member_with_a_matching_verified_email_is_linked_and_signed_in() {
    let w = World::new();
    let sam = w.member("sam", Some("sam@example.com")).await;
    // Google may write the address in other letters than the admin did.
    w.google.says("sub-sam", "sam@example.com", true);
    let (cookie, state) = w.start(Some("/recipes/7?x=1"));
    let out = w.back(&cookie, &state, None).await;
    let SignInOutcome::SignedIn { session, next } = out else {
        panic!("{out:?}");
    };
    assert_eq!(next, "/recipes/7?x=1");
    let who = w.services.auth.current_user(&session.token).await.unwrap();
    assert_eq!(who.map(|u| u.id), Some(sam.id));
    assert_eq!(session.lifetime, Duration::days(30));

    let link = w.link_of("sub-sam").await.unwrap();
    assert_eq!(
        (link.user_id, link.email.as_str()),
        (sam.id, "sam@example.com")
    );
    // Google was given what was sent to it: the code, the nonce and the verifier of this flow.
    let asked = w.google.asked.lock().unwrap().clone();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].0, "the-code");
}

#[tokio::test]
async fn the_second_sign_in_uses_the_link_even_after_the_email_changed() {
    let w = World::new();
    let sam = w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::SignedIn { .. }
    ));

    // Google's account changes address: the link still signs the member in.
    w.google.says("sub-sam", "sam@renamed.example", true);
    let (cookie, state) = w.start(None);
    let out = w.back(&cookie, &state, None).await;
    let SignInOutcome::SignedIn { session, .. } = out else {
        panic!("{out:?}");
    };
    let who = w.services.auth.current_user(&session.token).await.unwrap();
    assert_eq!(who.map(|u| u.id), Some(sam.id));
    assert_eq!(w.services.signin.identities(sam.id).await.unwrap().len(), 1);

    // An account that is not linked, whose address matches nobody, is a stranger.
    w.google.says("sub-other", "nobody@example.com", true);
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::NotMember
    ));
}

#[tokio::test]
async fn changing_or_clearing_the_email_ends_the_links_made_by_the_old_one() {
    let w = World::new();
    let sam = w.member("sam", Some("alicia@example.com")).await;
    // A stranger holding the mistyped address links to Sam on first sign-in.
    w.google.says("sub-stranger", "alicia@example.com", true);
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::SignedIn { .. }
    ));

    // The admin fixes the address: the stranger's link goes, and the stranger cannot get in again.
    w.services
        .users
        .set_email(sam.id, Some("sam@example.com"))
        .await
        .unwrap();
    assert!(w.link_of("sub-stranger").await.is_none());
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::NotMember
    ));
    // Sam's own Google account matches the new address.
    w.google.says("sub-sam", "sam@example.com", true);
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::SignedIn { .. }
    ));

    // Clearing the email ends that link too.
    w.services.users.set_email(sam.id, None).await.unwrap();
    assert!(w.link_of("sub-sam").await.is_none());
    let (cookie, state) = w.start(None);
    assert!(matches!(
        w.back(&cookie, &state, None).await,
        SignInOutcome::NotMember
    ));
}

#[tokio::test]
async fn a_callback_that_loses_the_race_to_link_the_same_member_still_signs_in() {
    // The first sign-in is on its way (no link yet) when a second callback for the same account links it.
    struct Racing {
        store: Arc<MemoryStore>,
        raced: std::sync::atomic::AtomicBool,
        /// Who the other callback links the account to.
        winner: Mutex<Option<Uuid>>,
    }
    #[async_trait]
    impl IdentityRepo for Racing {
        async fn find(&self, p: &str, s: &str) -> DomainResult<Option<domain::Identity>> {
            self.store.find(p, s).await
        }
        async fn list(&self, u: Uuid) -> DomainResult<Vec<domain::Identity>> {
            self.store.list(u).await
        }
        async fn create(&self, new: domain::NewIdentity) -> DomainResult<domain::Identity> {
            use std::sync::atomic::Ordering::SeqCst;
            if !self.raced.swap(true, SeqCst) {
                let user_id = self.winner.lock().unwrap().unwrap_or(new.user_id);
                IdentityRepo::create(
                    &*self.store,
                    domain::NewIdentity {
                        user_id,
                        provider: new.provider.clone(),
                        subject: new.subject.clone(),
                        email: new.email.clone(),
                    },
                )
                .await?;
            }
            self.store.create(new).await
        }
        async fn delete(&self, u: Uuid, id: Uuid) -> DomainResult<()> {
            self.store.delete(u, id).await
        }
    }

    for to_same_member in [true, false] {
        let w = World::new();
        let racing = Arc::new(Racing {
            store: w.store.clone(),
            raced: Default::default(),
            winner: Mutex::default(),
        });
        let services = w.services_with_identities(racing.clone());
        let sam = w.member("sam", Some("sam@example.com")).await;
        let kim = w.member("kim", Some("kim@example.com")).await;
        *racing.winner.lock().unwrap() = Some(if to_same_member { sam.id } else { kim.id });
        w.google.says("sub-sam", "sam@example.com", true);
        let started = services.signin.start(None, None).unwrap();
        let state = query_of(&started.url, "state");
        let reply = Callback {
            code: Some("the-code"),
            state: Some(&state),
            error: None,
        };
        let out = services
            .signin
            .finish(Some(&started.flow), reply, None, None)
            .await
            .unwrap();
        if to_same_member {
            let SignInOutcome::SignedIn { session, .. } = out else {
                panic!("{out:?}");
            };
            let who = w.services.auth.current_user(&session.token).await.unwrap();
            assert_eq!(who.map(|u| u.id), Some(sam.id));
        } else {
            // Linked to someone else in the meantime: never sign in as the member the email names.
            assert_failed(&out, false);
            assert_eq!(w.link_of("sub-sam").await.unwrap().user_id, kim.id);
        }
    }
}

#[tokio::test]
async fn a_client_address_whose_callbacks_keep_failing_is_locked_out_without_asking_google() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);
    let ip: std::net::IpAddr = "203.0.113.9".parse().unwrap();
    let other: std::net::IpAddr = "203.0.113.10".parse().unwrap();
    let (cookie, state) = w.start(None);
    let reply = Callback {
        code: Some("the-code"),
        state: Some(&state),
        error: None,
    };
    let from = |client| w.services.signin.finish(Some(&cookie), reply, None, client);

    // A Google that says no: failures count against the address.
    *w.google.reply.lock().unwrap() = Err("invalid_grant".into());
    for _ in 0..5 {
        assert_failed(&from(Some(ip)).await.unwrap(), false);
    }
    assert_eq!(w.google_was_asked(), 5);
    // Locked now: refused at once, even though Google would say yes, and Google is not asked.
    w.google.says("sub-sam", "sam@example.com", true);
    let out = from(Some(ip)).await.unwrap();
    assert!(
        matches!(
            out,
            SignInOutcome::Failed {
                error: Some(DomainError::RateLimited { .. }),
                ..
            }
        ),
        "{out:?}"
    );
    assert_eq!(w.google_was_asked(), 5);
    // Another address and a request with no known address are not affected.
    assert!(matches!(
        from(Some(other)).await.unwrap(),
        SignInOutcome::SignedIn { .. }
    ));
    assert_eq!(w.google_was_asked(), 6);

    // After the lock runs out the address is let in again.
    w.clock.advance(Duration::seconds(31));
    assert!(matches!(
        from(Some(ip)).await.unwrap(),
        SignInOutcome::SignedIn { .. }
    ));
}

#[tokio::test]
async fn good_callbacks_do_not_use_up_the_allowance_of_an_address() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);
    let ip: std::net::IpAddr = "203.0.113.9".parse().unwrap();
    for _ in 0..12 {
        let (cookie, state) = w.start(None);
        let reply = Callback {
            code: Some("the-code"),
            state: Some(&state),
            error: None,
        };
        let out = w
            .services
            .signin
            .finish(Some(&cookie), reply, None, Some(ip))
            .await
            .unwrap();
        assert!(matches!(out, SignInOutcome::SignedIn { .. }), "{out:?}");
    }
}

#[tokio::test]
async fn an_unverified_email_is_refused_even_when_it_matches() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", false);
    let (cookie, state) = w.start(None);
    assert_failed(&w.back(&cookie, &state, None).await, false);
    assert!(w.link_of("sub-sam").await.is_none());
}

#[tokio::test]
async fn a_wrong_or_missing_state_or_cookie_never_reaches_google() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);
    let (cookie, state) = w.start(None);
    let (_, other_state) = w.start(None);

    assert_failed(&w.back(&cookie, &other_state, None).await, false);
    assert_failed(&w.back(&cookie, &format!("{state}x"), None).await, false);
    assert_failed(&w.back(&cookie, "", None).await, false);
    let no_state = Callback {
        code: Some("c"),
        state: None,
        error: None,
    };
    let out = w
        .services
        .signin
        .finish(Some(&cookie), no_state, None, None)
        .await
        .unwrap();
    assert_failed(&out, false);
    let reply = Callback {
        code: Some("c"),
        state: Some(&state),
        error: None,
    };
    for bad in [None, Some("flow-999"), Some("garbage"), Some("")] {
        let out = w
            .services
            .signin
            .finish(bad, reply, None, None)
            .await
            .unwrap();
        assert_failed(&out, false);
    }
    assert_eq!(w.google_was_asked(), 0);
}

#[tokio::test]
async fn a_sign_in_older_than_ten_minutes_is_refused() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);

    let (cookie, state) = w.start(None);
    w.clock.advance(Duration::minutes(10));
    assert!(
        matches!(
            w.back(&cookie, &state, None).await,
            SignInOutcome::SignedIn { .. }
        ),
        "ten minutes is still fine"
    );

    let (cookie, state) = w.start(None);
    w.clock
        .advance(Duration::minutes(10) + Duration::seconds(1));
    assert_failed(&w.back(&cookie, &state, None).await, false);
    assert_eq!(w.google_was_asked(), 1, "the late one never reached Google");
}

#[tokio::test]
async fn a_no_from_google_a_missing_code_or_a_google_error_fails() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    let (cookie, state) = w.start(None);

    let denied = Callback {
        code: None,
        state: Some(&state),
        error: Some("access_denied"),
    };
    let out = w
        .services
        .signin
        .finish(Some(&cookie), denied, None, None)
        .await
        .unwrap();
    assert_failed(&out, false);
    let no_code = Callback {
        code: None,
        state: Some(&state),
        error: None,
    };
    let out = w
        .services
        .signin
        .finish(Some(&cookie), no_code, None, None)
        .await
        .unwrap();
    assert_failed(&out, false);
    assert_eq!(w.google_was_asked(), 0);

    // Google refuses the code: the reason is handed back for the log.
    *w.google.reply.lock().unwrap() = Err("Google refused the request (400).".into());
    let out = w.back(&cookie, &state, None).await;
    assert!(
        matches!(
            &out,
            SignInOutcome::Failed {
                error: Some(DomainError::Google(_)),
                ..
            }
        ),
        "{out:?}"
    );
}

#[tokio::test]
async fn next_is_a_path_on_this_site_or_the_front_page() {
    let w = World::new();
    w.member("sam", Some("sam@example.com")).await;
    w.google.says("sub-sam", "sam@example.com", true);
    for (given, want) in [
        (Some("https://evil.example"), "/"),
        (Some("//evil.example"), "/"),
        (Some("/\\evil.example"), "/"),
        (None, "/"),
        (Some("/settings"), "/settings"),
    ] {
        let (cookie, state) = w.start(given);
        let out = w.back(&cookie, &state, None).await;
        let SignInOutcome::SignedIn { next, .. } = out else {
            panic!("{out:?}");
        };
        assert_eq!(next, want, "{given:?}");
    }
}

#[tokio::test]
async fn linking_from_settings_needs_no_matching_email() {
    let w = World::new();
    let sam = w.member("sam", None).await;
    w.google.says("sub-sam", "sam@gmail.example", true);
    let (cookie, state) = w.start_link(sam.id);
    let out = w.back(&cookie, &state, Some(sam.id)).await;
    assert!(matches!(out, SignInOutcome::Linked), "{out:?}");
    let links = w.services.signin.identities(sam.id).await.unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].email, "sam@gmail.example");

    // Doing it again is fine and links nothing twice.
    let (cookie, state) = w.start_link(sam.id);
    assert!(matches!(
        w.back(&cookie, &state, Some(sam.id)).await,
        SignInOutcome::Linked
    ));
    assert_eq!(w.services.signin.identities(sam.id).await.unwrap().len(), 1);
    // And no session was started by it: a link is not a sign-in.
}

#[tokio::test]
async fn an_account_linked_to_someone_else_is_taken() {
    let w = World::new();
    let sam = w.member("sam", None).await;
    let alex = w.member("alex", None).await;
    w.google.says("sub-shared", "shared@gmail.example", true);
    let (cookie, state) = w.start_link(sam.id);
    assert!(matches!(
        w.back(&cookie, &state, Some(sam.id)).await,
        SignInOutcome::Linked
    ));

    let (cookie, state) = w.start_link(alex.id);
    let out = w.back(&cookie, &state, Some(alex.id)).await;
    assert!(matches!(out, SignInOutcome::Taken), "{out:?}");
    assert!(
        w.services
            .signin
            .identities(alex.id)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn a_link_must_be_finished_by_the_member_who_started_it() {
    let w = World::new();
    let sam = w.member("sam", None).await;
    let alex = w.member("alex", None).await;
    w.google.says("sub-sam", "sam@gmail.example", true);
    let (cookie, state) = w.start_link(sam.id);
    for who in [None, Some(alex.id)] {
        assert_failed(&w.back(&cookie, &state, who).await, true);
    }
    assert_eq!(w.google_was_asked(), 0);
    assert!(w.link_of("sub-sam").await.is_none());
}

#[tokio::test]
async fn unlinking_removes_only_your_own_link() {
    let w = World::new();
    let sam = w.member("sam", None).await;
    let alex = w.member("alex", None).await;
    w.google.says("sub-sam", "sam@gmail.example", true);
    let (cookie, state) = w.start_link(sam.id);
    w.back(&cookie, &state, Some(sam.id)).await;
    let id = w.services.signin.identities(sam.id).await.unwrap()[0].id;

    let theirs = w.services.signin.unlink(alex.id, id).await;
    assert!(
        matches!(theirs, Err(DomainError::NotFound(_))),
        "{theirs:?}"
    );
    assert_eq!(w.services.signin.identities(sam.id).await.unwrap().len(), 1);
    w.services.signin.unlink(sam.id, id).await.unwrap();
    assert!(
        w.services
            .signin
            .identities(sam.id)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        w.services.signin.unlink(sam.id, id).await,
        Err(DomainError::NotFound(_))
    ));
}

#[tokio::test]
async fn a_members_email_is_checked_and_unique() {
    let w = World::new();
    let users = &w.services.users;
    let pw = || "a long enough password".to_string();

    let sam = users
        .create("sam", "Sam", pw(), "member", Some("  Sam@Example.COM "))
        .await
        .unwrap();
    assert_eq!(sam.email.as_deref(), Some("sam@example.com"));
    let blank = users
        .create("alex", "Alex", pw(), "member", Some("  "))
        .await
        .unwrap();
    assert_eq!(blank.email, None);

    let bad = users
        .create("bob", "Bob", pw(), "member", Some("not an email"))
        .await;
    assert!(matches!(bad, Err(DomainError::Validation(m)) if m.starts_with("email:")));
    let dup = users
        .create("bob", "Bob", pw(), "member", Some("SAM@example.com"))
        .await;
    assert!(matches!(dup, Err(DomainError::Conflict(_))), "{dup:?}");

    let set = users
        .set_email(blank.id, Some("Alex@Example.com"))
        .await
        .unwrap();
    assert_eq!(set.email.as_deref(), Some("alex@example.com"));
    assert!(matches!(
        users.set_email(blank.id, Some("sam@example.com")).await,
        Err(DomainError::Conflict(_))
    ));
    assert!(matches!(
        users.set_email(blank.id, Some("nope")).await,
        Err(DomainError::Validation(_))
    ));
    let cleared = users.set_email(blank.id, None).await.unwrap();
    assert_eq!(cleared.email, None);
    assert!(matches!(
        users.set_email(Uuid::new_v4(), None).await,
        Err(DomainError::NotFound(_))
    ));
}
