//! Postgres adapter: implements the storage ports with SQL (docs/adr/0008). Owns the migrations, the row structs
//! and the mapping of `sqlx::Error` to `DomainError`; nothing from sqlx crosses a port.
//!
//! Every repository is built from a pool and the [`ports::Clock`]; rows are stamped with the clock, never with
//! the database's `now()`.

mod accounts;
mod error;
mod images;
mod recipes;

pub use accounts::{PgSessionRepo, PgSettingsRepo, PgStorageHealth, PgTagRepo, PgUserRepo};
pub use images::PgImageRepo;
pub use recipes::PgRecipeRepo;
pub use sqlx::PgPool;

/// Applies the embedded migrations (`migrations/` in this crate). Safe to run on every start.
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
