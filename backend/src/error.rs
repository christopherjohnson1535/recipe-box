use axum::{
    Json,
    extract::{
        FromRequest, FromRequestParts,
        multipart::MultipartError,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

/// Every non-2xx response goes through this type: `{ "error": { "code", "message" } }` (docs/API.md "Errors").
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Unauthenticated(&'static str),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("Upload is too large.")]
    TooLarge,
    #[error("{0}")]
    UnsupportedMedia(String),
    #[error("{0}")]
    NoRecipeFound(String),
    #[error("This needs an AI provider, and none is configured.")]
    AiDisabled,
    #[error("That address is not allowed.")]
    BlockedAddress,
    #[error("{0}")]
    SiteBlocked(String),
    #[error("{0}")]
    FetchFailed(String),
    #[error("{0}")]
    NotImplemented(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    pub const SIGN_IN: Self = Self::Unauthenticated("Please sign in.");

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    pub fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            Self::Validation(_) => (StatusCode::BAD_REQUEST, "validation"),
            Self::Unauthenticated(_) => (StatusCode::UNAUTHORIZED, "unauthenticated"),
            Self::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden"),
            Self::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            Self::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            Self::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "too_large"),
            Self::UnsupportedMedia(_) => (StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media"),
            Self::NoRecipeFound(_) => (StatusCode::UNPROCESSABLE_ENTITY, "no_recipe_found"),
            Self::AiDisabled => (StatusCode::UNPROCESSABLE_ENTITY, "ai_disabled"),
            Self::BlockedAddress => (StatusCode::UNPROCESSABLE_ENTITY, "blocked_address"),
            Self::SiteBlocked(_) => (StatusCode::BAD_GATEWAY, "site_blocked"),
            Self::FetchFailed(_) => (StatusCode::BAD_GATEWAY, "fetch_failed"),
            Self::NotImplemented(_) => (StatusCode::NOT_IMPLEMENTED, "not_implemented"),
            Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();
        let message = match &self {
            Self::Internal(e) => {
                tracing::error!(error = ?e, "internal error");
                "Something went wrong.".to_string()
            }
            other => other.to_string(),
        };
        (
            status,
            Json(json!({ "error": { "code": code, "message": message } })),
        )
            .into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(e.into())
    }
}

impl From<JsonRejection> for AppError {
    fn from(r: JsonRejection) -> Self {
        match r.status() {
            StatusCode::PAYLOAD_TOO_LARGE => Self::TooLarge,
            _ => Self::Validation(r.body_text()),
        }
    }
}

impl From<QueryRejection> for AppError {
    fn from(r: QueryRejection) -> Self {
        Self::Validation(r.body_text())
    }
}

impl From<PathRejection> for AppError {
    fn from(r: PathRejection) -> Self {
        Self::Validation(r.body_text())
    }
}

impl From<MultipartError> for AppError {
    fn from(e: MultipartError) -> Self {
        match e.status() {
            StatusCode::PAYLOAD_TOO_LARGE => Self::TooLarge,
            _ => Self::Validation(e.body_text()),
        }
    }
}

/// `axum::Json` with errors in our JSON shape.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct AppJson<T>(pub T);

/// `axum::extract::Query` with errors in our JSON shape.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Query), rejection(AppError))]
pub struct AppQuery<T>(pub T);

/// `axum::extract::Path` with errors in our JSON shape.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct AppPath<T>(pub T);

pub type AppResult<T> = Result<T, AppError>;
