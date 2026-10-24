//! `sqlx::Error` to `DomainError`. (A `From` impl is not possible: both types are foreign to this crate.)

use domain::DomainError;
use sqlx::error::ErrorKind;

/// An unexpected database failure: logged by the HTTP layer, shown to the client as "Something went wrong.".
pub(crate) fn db(e: sqlx::Error) -> DomainError {
    DomainError::Internal(e.to_string())
}

/// The kind of constraint a statement violated, if it was one.
pub(crate) fn violation(e: &sqlx::Error) -> Option<ErrorKind> {
    match e {
        sqlx::Error::Database(d) => Some(d.kind()),
        _ => None,
    }
}
