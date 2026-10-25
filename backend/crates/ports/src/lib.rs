//! Outbound ports: what the application needs from storage, the clock, AI, the network and the file system.
//!
//! Every port is a dyn-compatible `async-trait` trait, so services can hold `Arc<dyn Port>`, and returns
//! [`DomainResult`]: an adapter maps its own errors (SQL, disk, HTTP) into [`domain::DomainError`] and never leaks
//! them. Each trait states its contract in rustdoc. The `contract` feature adds `contract`, the behavioural test
//! suite every adapter must pass (docs/adr/0008).

use std::{future::Future, pin::Pin, time::Duration};

use async_trait::async_trait;
use domain::{
    AiProvider, DomainResult, PhotoMode, RecipeDraft, Secret, SignInFlow,
    chrono::{DateTime, Utc},
    url::Url,
    uuid::Uuid,
};

mod repos;

#[cfg(feature = "contract")]
pub mod contract;

pub use repos::{
    Compute, GoogleConnection, GoogleConnectionRepo, GroceryItem, GroceryList, GroceryRepo,
    IdentityRepo, ImageRepo, ListedRecipe, NewGroceryItem, RecipeRepo, SessionRepo, SettingsRepo,
    StorageHealth, TagRepo, UserRepo,
};

/// The one source of "now" for every time rule (restore window, session expiry, purge). Repositories are built
/// with a clock and stamp rows with it; nothing else may read the wall clock, so tests can move time.
pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

/// Password hashing (argon2id in production).
#[async_trait]
pub trait PasswordHasher: Send + Sync {
    /// A salted hash of `password` as a self-describing string (PHC format); two calls give different strings.
    async fn hash(&self, password: String) -> DomainResult<String>;

    /// Whether `password` matches `hash`. With `hash` of `None` (no such user) it does the same work against a
    /// dummy hash, so timing does not reveal whether the user exists, and answers `false`. A `hash` that cannot be
    /// parsed answers `false`.
    async fn verify(&self, password: String, hash: Option<String>) -> DomainResult<bool>;
}

/// Where image files live (a directory, object storage). Blobs are addressed by flat file names, and only the
/// names the application writes are valid: `^[0-9a-f-]{36}(\.display)?\.jpg$` (see
/// [`domain::validate::media_file_name`]). Any other name (empty, `.`, `..`, a path, upper case, a space, a NUL)
/// is rejected with `Validation` by `put`, `get` and `delete` alike, so an adapter can never be looser than the
/// route that serves files. Nothing is served as uploaded: callers store what they have already re-encoded.
#[async_trait]
pub trait MediaStore: Send + Sync {
    /// Stores `bytes` under `name`, replacing any blob already there.
    async fn put(&self, name: &str, bytes: Vec<u8>) -> DomainResult<()>;

    /// The blob, or `None` when there is none under `name`.
    async fn get(&self, name: &str) -> DomainResult<Option<Vec<u8>>>;

    /// Removes the blob. Removing one that does not exist is not an error.
    async fn delete(&self, name: &str) -> DomainResult<()>;
}

/// Turns photos or text into a recipe draft (the AI provider). Drafts are never saved by the port.
#[async_trait]
pub trait RecipeExtractor: Send + Sync {
    /// Which provider is configured. Anything but [`AiProvider::None`] means AI features are on.
    fn provider(&self) -> AiProvider;

    /// `images` are decoded JPEG bytes in page order. Fails with `AiDisabled` when no provider is configured,
    /// `NoRecipeFound` when the input holds no recipe and `Ai` when the provider fails. Any other error (for
    /// example `Internal` for bytes that are not an image) is a failure of the call itself: the caller treats the
    /// input as bad and must not assume it was valid.
    async fn extract_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> DomainResult<RecipeDraft>;

    /// Same failures as [`RecipeExtractor::extract_images`], for pasted or scraped text. Reads at most
    /// [`domain::MAX_TEXT_INPUT_CHARS`] characters and silently ignores the rest; the caller warns about that,
    /// so an implementation must keep to the same cap.
    async fn extract_text(&self, text: &str) -> DomainResult<RecipeDraft>;
}

/// A page fetched by a [`PageFetcher`].
pub struct FetchedPage {
    /// The address after redirects.
    pub final_url: Url,
    /// The `Content-Type` header as sent, if any.
    pub content_type: Option<String>,
    /// At most the `max_bytes` asked for.
    pub body: Vec<u8>,
}

/// Fetches a user-supplied address. The only way the application may touch one (SSRF guard, LNK-7).
#[async_trait]
pub trait PageFetcher: Send + Sync {
    /// Fetches `url`, following redirects. Every hop must be vetted: only public addresses, otherwise
    /// `BlockedAddress`. A site that refuses bots (401/403/429/503, a bot-check page) is `SiteBlocked`, any other
    /// failure (timeout, bad status, body over `max_bytes`) is `FetchFailed`.
    async fn fetch(&self, url: &Url, max_bytes: usize) -> DomainResult<FetchedPage>;

    /// The whole time budget for reading one page: fetching it and parsing it. It applies to each
    /// [`PageFetcher::fetch`] call separately (the page-image download gets its own), and `fetch` keeps to it on
    /// its own; the caller hands what is left of it to [`PageReader::read`].
    fn budget(&self) -> Duration;
}

/// What [`PageReader::read`] found on a page.
pub enum PageContent {
    /// The page holds a recipe (JSON-LD or microdata), as a link-sourced draft with `source_url` (the page's
    /// `final_url`) and `image_url`.
    Draft(Box<RecipeDraft>),
    /// No recipe data; the readable text for the AI fallback, of any length (the caller decides whether there is
    /// enough of it to be worth sending, see [`domain::MIN_PAGE_CHARS`]).
    Text {
        text: String,
        /// `og:image`, absolute http(s) only.
        image_url: Option<String>,
        site_name: Option<String>,
    },
    /// No recipe data, and the text was not asked for.
    Nothing,
}

/// Reads a fetched page. Parsing is CPU-bound, so an implementation runs it off the async workers.
#[async_trait]
pub trait PageReader: Send + Sync {
    /// The recipe the page's markup holds, if any; else, when `want_text`, the page's readable text (for the AI
    /// fallback); else [`PageContent::Nothing`]. A page with JSON-LD gives a `Draft` whatever `want_text` is.
    /// Takes at most `budget`, otherwise `FetchFailed("That page took too long to read.")`; `Internal` when the
    /// parsing task itself fails.
    async fn read(
        &self,
        page: FetchedPage,
        want_text: bool,
        budget: Duration,
    ) -> DomainResult<PageContent>;
}

/// Work for a [`TaskSpawner`]: a failure is the spawner's to report.
pub type SpawnedTask = Pin<Box<dyn Future<Output = DomainResult<()>> + Send + 'static>>;

/// Runs work that must finish even when the request that started it is dropped (a client that disconnects).
pub trait TaskSpawner: Send + Sync {
    /// Starts `task` on the runtime and returns at once; nothing waits for it. Nobody is left to see its result,
    /// so when it is `Err` the spawner logs it (warn level), naming the work by `what`, a short sentence such as
    /// "could not delete images of a failed request".
    fn spawn(&self, what: &'static str, task: SpawnedTask);
}

/// An uploaded image after [`ImageCodec::encode`]: always a JPEG.
pub struct EncodedImage {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// The print-style rendition, or `None` when making it failed (that must not fail the upload).
    pub display: Option<Vec<u8>>,
}

/// Decodes and re-encodes uploaded images (nothing is served as uploaded) and makes the print-style rendition.
#[async_trait]
pub trait ImageCodec: Send + Sync {
    /// Decodes `data` (JPEG, PNG, WebP, GIF, HEIC) and re-encodes it as JPEG, long edge at most 2400 px, with the
    /// rendition for image `id`. `UnsupportedMedia` when it is not a readable image or is over the size bounds.
    async fn encode(&self, id: Uuid, data: Vec<u8>) -> DomainResult<EncodedImage>;

    /// The rendition of an already stored original JPEG.
    async fn render_display(&self, id: Uuid, jpeg: Vec<u8>) -> DomainResult<Vec<u8>>;
}

/// Opaque session tokens. Only `digest(token)` is stored.
pub trait SessionTokens: Send + Sync {
    /// A new unguessable token, safe to put in a cookie.
    fn generate(&self) -> String;

    /// What is stored for `token`; the same token always gives the same digest.
    fn digest(&self, token: &str) -> Vec<u8>;
}

/// One parent task of a Google Tasks list: a store section and the items beneath it, as one-line titles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskSection {
    pub title: String,
    pub items: Vec<String>,
}

/// Google sign-in and Google Tasks (GRO-5). Every method that talks to Google answers `Google` when the call
/// fails (timeout, 5xx, a reply it could not read) and never puts a token in an error. A token is only ever sent to
/// Google. Without configuration, `configured` is false and every other method fails with `GoogleDisabled`.
#[async_trait]
pub trait GoogleTasks: Send + Sync {
    /// Whether the server has a Google OAuth client. The one method that works either way.
    fn configured(&self) -> bool;

    /// Where to send the browser to ask for the `tasks` scope with offline access. `state` comes back unchanged on
    /// the redirect.
    fn consent_url(&self, state: &str) -> DomainResult<Url>;

    /// Trades the `code` of the redirect for a refresh token. `Google` when Google refuses the code or sends no
    /// refresh token.
    async fn exchange_code(&self, code: &str) -> DomainResult<Secret>;

    /// A short-lived access token. `GoogleNotConnected` when Google says the refresh token is no longer valid
    /// (revoked, expired, the account removed access).
    async fn access_token(&self, refresh: &Secret) -> DomainResult<Secret>;

    /// Revokes a token at Google.
    async fn revoke(&self, token: &Secret) -> DomainResult<()>;

    /// The task list to send to: the one `tasklist_id` names if Google still has it; else the first list titled
    /// exactly `title`; else a new list called `title`. Returns its id.
    async fn ensure_list(
        &self,
        access: &Secret,
        tasklist_id: Option<&str>,
        title: &str,
    ) -> DomainResult<String>;

    /// Makes the list `tasklist_id` hold exactly `sections`: every task in it is deleted first, then one parent
    /// task per section is made in order, each item a subtask of its section in order. Safe to run again after a
    /// failure half way: it starts by emptying the list. `Google` when Google refuses a call; the list may then be
    /// partly filled.
    async fn fill_list(
        &self,
        access: &Secret,
        tasklist_id: &str,
        sections: &[TaskSection],
    ) -> DomainResult<()>;
}

/// A Google account that proved who it is: the claims of a checked ID token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleAccount {
    /// Google's stable id for the account (`sub`); the email can change, this cannot.
    pub subject: String,
    /// The account's address, lower-cased.
    pub email: String,
    /// Whether Google says it has verified `email`.
    pub email_verified: bool,
}

/// Sign in with Google (ACC-6): the OpenID Connect authorization-code flow with PKCE, confidential client. Google
/// only says who someone is; nothing here creates a member. The client secret, the code and the tokens never leave
/// the implementation and never appear in an error or a log.
#[async_trait]
pub trait GoogleSignIn: Send + Sync {
    /// Whether the server has a Google OAuth client. The one method that works either way.
    fn configured(&self) -> bool;

    /// Where to send the browser: scopes `openid email profile`, `prompt=select_account`, the redirect address
    /// below `PUBLIC_URL`, and the PKCE S256 challenge derived from `code_verifier`. `state` and `nonce` come
    /// back unchanged in the redirect and the ID token. `GoogleDisabled` when not configured.
    fn authorize_url(&self, state: &str, nonce: &str, code_verifier: &str) -> DomainResult<Url>;

    /// Trades the `code` of the redirect (with the PKCE `code_verifier`) for an ID token and checks it: signature
    /// against Google's published keys, issuer, audience (our client id), expiry and `nonce`. Whether the email is
    /// verified is reported, not enforced. `Google` for any refusal or unreadable answer, `GoogleDisabled` when not
    /// configured.
    async fn account(
        &self,
        code: &str,
        nonce: &str,
        code_verifier: &Secret,
    ) -> DomainResult<GoogleAccount>;
}

/// Packs a [`domain::SignInFlow`] into text for the `rb_oauth` cookie, sealed so the browser can neither read nor
/// change it, and unpacks it again.
pub trait FlowSealer: Send + Sync {
    /// Cookie-safe text that only `open` can read back. Two seals of the same flow differ.
    fn seal(&self, flow: &SignInFlow) -> DomainResult<String>;

    /// The flow in `sealed`. `Validation` when it was not made by this key, was changed, or is not a flow (a
    /// sealed Google refresh token, for one): the purposes never mix. `GoogleDisabled` when not configured.
    fn open(&self, sealed: &str) -> DomainResult<SignInFlow>;
}

/// Seals secrets before they are stored. The key never leaves the implementation.
pub trait TokenCipher: Send + Sync {
    /// An opaque blob that only `open` can read back. Two seals of the same secret differ.
    fn seal(&self, secret: &Secret) -> DomainResult<Vec<u8>>;

    /// The secret in `sealed`. `Internal` when it was not made by this key or was changed.
    fn open(&self, sealed: &[u8]) -> DomainResult<Secret>;
}

/// Reads and writes the backup archive format (ACC-5, docs/API.md "Backup archive"). The application hands over
/// recipes and photos and gets bytes back, so it never sees zip.
#[async_trait]
pub trait BackupFormat: Send + Sync {
    /// A writer for a new archive.
    fn writer(&self) -> Box<dyn BackupWriter>;

    /// Opens the archive file at `path` and checks its structure against `limits` before returning: it is a
    /// readable archive of this format, has no entry that is not part of the format (so no path that leaves the
    /// archive: absolute, `..`, or any other name), no duplicate or encrypted entry, no overlapping entries, and
    /// stays within `limits` (entry count, declared sizes). `Validation` for anything wrong with the file.
    async fn open(
        &self,
        path: std::path::PathBuf,
        limits: domain::BackupLimits,
    ) -> DomainResult<Box<dyn BackupReader>>;
}

/// Builds one archive. Each call returns the bytes ready to send so far, which the caller streams on, so the whole
/// archive is never held in memory. Call `photo` for each photo, then `finish` once.
pub trait BackupWriter: Send {
    /// Adds the JPEG of image `image_id`.
    fn photo(&mut self, image_id: Uuid, jpeg: &[u8]) -> DomainResult<Vec<u8>>;

    /// Adds the recipes (their image ids must be ones passed to `photo`) and ends the archive.
    fn finish(
        &mut self,
        exported_at: DateTime<Utc>,
        recipes: &[domain::BackupRecipe],
    ) -> DomainResult<Vec<u8>>;
}

/// An opened archive.
#[async_trait]
pub trait BackupReader: Send + Sync {
    /// The recipes. `Validation` when the manifest is not valid JSON of the format, was made by a newer version,
    /// holds more than `limits.max_recipes`, or refers to a photo that is not in the archive. The recipe fields
    /// themselves are not checked here.
    async fn recipes(&self) -> DomainResult<Vec<domain::BackupRecipe>>;

    /// The bytes of the photo with archive image id `image_id`, or `None` when the archive has none. Never more
    /// than `limits.max_photo_bytes`: a photo that expands to more is `Validation`.
    async fn photo(&self, image_id: Uuid) -> DomainResult<Option<Vec<u8>>>;
}
