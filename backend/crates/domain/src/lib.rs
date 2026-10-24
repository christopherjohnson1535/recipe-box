//! Recipe Box domain: pure types and rules. No web, database or OpenAPI dependencies (docs/adr/0008).

pub mod error;
pub mod model;
pub mod validate;

// The value types other crates share. Ports and adapters name them through here, so `domain` is the one place
// that decides their versions and they need no dependency of their own.
pub use chrono;
pub use url;
pub use uuid;

use chrono::Duration;

pub use error::{DomainError, DomainResult};
pub use model::*;

/// Soft-deleted recipes are hard-deleted once they are older than this.
pub const PURGE_AFTER: Duration = Duration::days(1);

/// A soft-deleted recipe can be restored for this many minutes.
pub const RESTORE_WINDOW_MINUTES: i32 = 10;

/// The `role` value that may manage users.
pub const ROLE_ADMIN: &str = "admin";
