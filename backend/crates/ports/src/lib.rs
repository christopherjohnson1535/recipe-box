//! Outbound ports: what the application needs from storage, the clock, AI, the network and the file system.
//!
//! Every port is a dyn-compatible `async-trait` trait, so services can hold `Arc<dyn Port>`, and returns
//! [`DomainResult`]: an adapter maps its own errors (SQL, disk, HTTP) into [`domain::DomainError`] and never leaks
//! them. Each trait states its contract in rustdoc. The `contract` feature adds [`contract`], the behavioural test
//! suite every adapter must pass (docs/adr/0008).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use domain::{DomainResult, PhotoMode, RecipeDraft};
use url::Url;

mod repos;

#[cfg(feature = "contract")]
pub mod contract;

pub use repos::{ImageRepo, RecipeRepo, SessionRepo, SettingsRepo, TagRepo, UserRepo};

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

/// Where image files live (a directory, object storage). Blobs are addressed by flat file names such as
/// `<uuid>.jpg`; a name with a path separator or `..` is rejected with `Validation`. Nothing is served as uploaded:
/// callers store what they have already re-encoded.
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
#[derive(Debug, Clone)]
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
}
