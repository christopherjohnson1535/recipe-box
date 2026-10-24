//! Recipe Box domain: pure types and rules. No web, database or OpenAPI dependencies (docs/adr/0008).

pub mod error;
pub mod model;
pub mod secret;
pub mod source;
pub mod validate;

// The value types other crates share. Ports and adapters name them through here, so `domain` is the one place
// that decides their versions and they need no dependency of their own.
pub use chrono;
pub use url;
pub use uuid;

use chrono::Duration;

pub use error::{DomainError, DomainResult};
pub use model::*;
pub use secret::Secret;

/// Soft-deleted recipes are hard-deleted once they are older than this.
pub const PURGE_AFTER: Duration = Duration::days(1);

/// A soft-deleted recipe can be restored for this many minutes.
pub const RESTORE_WINDOW_MINUTES: i32 = 10;

/// The `role` value that may manage users.
pub const ROLE_ADMIN: &str = "admin";

/// Longest pasted or scraped text an AI import reads; the import service warns when the text is longer.
pub const MAX_TEXT_INPUT_CHARS: usize = 50_000;

/// Which recipe extractor is configured (`AI_PROVIDER`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    None,
    Anthropic,
}
