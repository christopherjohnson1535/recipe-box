//! Outbound ports: what the application needs from storage, the clock, AI, the network and the file system.
//!
//! Every port is a dyn-compatible `async-trait` trait, so services can hold `Arc<dyn Port>`, and returns
//! [`DomainResult`]: an adapter maps its own errors (SQL, disk, HTTP) into [`domain::DomainError`] and never leaks
//! them. Each trait states its contract in rustdoc. The `contract` feature adds `contract`, the behavioural test
//! suite every adapter must pass (docs/adr/0008).

use std::{future::Future, pin::Pin, time::Duration};

use async_trait::async_trait;
use domain::{
    AiProvider, DomainResult, PhotoMode, RecipeDraft,
    chrono::{DateTime, Utc},
    url::Url,
    uuid::Uuid,
};

mod repos;

#[cfg(feature = "contract")]
pub mod contract;

pub use repos::{
    ImageRepo, RecipeRepo, SessionRepo, SettingsRepo, StorageHealth, TagRepo, UserRepo,
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
    /// `NoRecipeFound` when the input holds no recipe and `Ai` when the provider fails.
    async fn extract_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> DomainResult<RecipeDraft>;

    /// Same failures as [`RecipeExtractor::extract_images`], for pasted or scraped text.
    async fn extract_text(&self, text: &str) -> DomainResult<RecipeDraft>;
}

/// A page fetched by a [`PageFetcher`].
pub struct FetchedPage {
    /// The address after redirects.
    pub final_url: Url,
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

    /// The whole time budget for reading one page: fetching it and parsing it. [`PageFetcher::fetch`] keeps to it
    /// on its own; the caller hands what is left to [`PageReader::read`].
    fn budget(&self) -> Duration;
}

/// What [`PageReader::read`] found on a page.
pub enum PageContent {
    /// The page holds a recipe (JSON-LD or microdata), as a link-sourced draft with `source_url` and `image_url`.
    Draft(Box<RecipeDraft>),
    /// No recipe data; the readable text for the AI fallback.
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
    /// fallback); else [`PageContent::Nothing`]. Takes at most `budget`, otherwise `FetchFailed("That page took
    /// too long to read.")`.
    async fn read(
        &self,
        page: FetchedPage,
        want_text: bool,
        budget: Duration,
    ) -> DomainResult<PageContent>;
}

/// Runs work that must finish even when the request that started it is dropped (a client that disconnects).
pub trait TaskSpawner: Send + Sync {
    /// Starts `task` on the runtime and returns at once; nothing waits for it.
    fn spawn(&self, task: Pin<Box<dyn Future<Output = ()> + Send + 'static>>);
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
