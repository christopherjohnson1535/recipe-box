//! Recipe import: link (`safe_fetch` + `jsonld`), text and photos (`ai`).
//!
//! Scaffold only. The routes in `routes/imports.rs` return 501 until the feature issues fill these modules in.
//! Import endpoints never save: they return a [`crate::models::RecipeDraft`] and the client POSTs the reviewed
//! draft to `/api/recipes`.

pub mod ai;
pub mod jsonld;
pub mod safe_fetch;
