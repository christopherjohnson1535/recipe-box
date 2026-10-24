//! Recipe import wiring: provider selection (`ai`) and the HEIC converter (`photo`). Link parsing is the
//! `adapter_html` crate, fetching `adapter_http_fetch`.
//!
//! Import endpoints never save: they return a [`crate::models::RecipeDraft`] and the client POSTs the reviewed
//! draft to `/api/recipes`.

pub mod ai;
pub mod photo;
pub mod safe_fetch;

pub use domain::source::normalize_url;
