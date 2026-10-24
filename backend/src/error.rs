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
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

/// The `code` of an error response (docs/API.md "Errors"). `api_unreachable` and `network` are not in it: the
/// frontend proxy and browser client make those up.
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Validation,
    Unauthenticated,
    Forbidden,
    NotFound,
    MethodNotAllowed,
    Conflict,
    TooLarge,
    UnsupportedMedia,
    NoRecipeFound,
    AiDisabled,
    AiError,
    BlockedAddress,
    SiteBlocked,
    FetchFailed,
    NotImplemented,
    Internal,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
    /// Photo import only: the photos were stored but no draft could be made.
    #[serde(skip_serializing_if = "Option::is_none", rename = "photoImageIds")]
    pub photo_image_ids: Option<Vec<Uuid>>,
}

/// Body of every non-2xx response.
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

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
    #[error("That method is not allowed here.")]
    MethodNotAllowed,
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
    #[error("{0}")]
    AiError(String),
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
    /// `error` plus the ids of photos that were stored anyway (photo import).
    #[error("{error}")]
    WithPhotos {
        error: Box<AppError>,
        photo_image_ids: Vec<Uuid>,
    },
}

impl AppError {
    pub const SIGN_IN: Self = Self::Unauthenticated("Please sign in.");

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    pub fn status_and_code(&self) -> (StatusCode, ErrorCode) {
        match self {
            Self::Validation(_) => (StatusCode::BAD_REQUEST, ErrorCode::Validation),
            Self::Unauthenticated(_) => (StatusCode::UNAUTHORIZED, ErrorCode::Unauthenticated),
            Self::Forbidden(_) => (StatusCode::FORBIDDEN, ErrorCode::Forbidden),
            Self::NotFound(_) => (StatusCode::NOT_FOUND, ErrorCode::NotFound),
            Self::MethodNotAllowed => (StatusCode::METHOD_NOT_ALLOWED, ErrorCode::MethodNotAllowed),
            Self::Conflict(_) => (StatusCode::CONFLICT, ErrorCode::Conflict),
            Self::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, ErrorCode::TooLarge),
            Self::UnsupportedMedia(_) => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                ErrorCode::UnsupportedMedia,
            ),
            Self::NoRecipeFound(_) => (StatusCode::UNPROCESSABLE_ENTITY, ErrorCode::NoRecipeFound),
            Self::AiDisabled => (StatusCode::UNPROCESSABLE_ENTITY, ErrorCode::AiDisabled),
            Self::AiError(_) => (StatusCode::BAD_GATEWAY, ErrorCode::AiError),
            Self::BlockedAddress => (StatusCode::UNPROCESSABLE_ENTITY, ErrorCode::BlockedAddress),
            Self::SiteBlocked(_) => (StatusCode::BAD_GATEWAY, ErrorCode::SiteBlocked),
            Self::FetchFailed(_) => (StatusCode::BAD_GATEWAY, ErrorCode::FetchFailed),
            Self::NotImplemented(_) => (StatusCode::NOT_IMPLEMENTED, ErrorCode::NotImplemented),
            Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, ErrorCode::Internal),
            Self::WithPhotos { error, .. } => error.status_and_code(),
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
        let photo_image_ids = match &self {
            Self::WithPhotos {
                photo_image_ids, ..
            } => Some(photo_image_ids.clone()),
            _ => None,
        };
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail {
                    code,
                    message,
                    photo_image_ids,
                },
            }),
        )
            .into_response()
    }
}

impl From<domain::DomainError> for AppError {
    fn from(e: domain::DomainError) -> Self {
        use domain::DomainError as D;
        match e {
            D::Validation(m) => Self::Validation(m),
            D::NotFound(m) => Self::NotFound(m),
            D::Conflict(m) => Self::Conflict(m),
            D::Forbidden(m) => Self::Forbidden(m),
            D::Unauthenticated(m) => Self::Unauthenticated(m),
            D::AiDisabled => Self::AiDisabled,
            D::Ai(m) => Self::AiError(m),
            D::NoRecipeFound(m) => Self::NoRecipeFound(m),
            D::BlockedAddress => Self::BlockedAddress,
            D::SiteBlocked(m) => Self::SiteBlocked(m),
            D::FetchFailed(m) => Self::FetchFailed(m),
            D::Internal(m) => Self::Internal(anyhow::anyhow!(m)),
        }
    }
}

impl From<JsonRejection> for AppError {
    fn from(r: JsonRejection) -> Self {
        match r.status() {
            StatusCode::PAYLOAD_TOO_LARGE => Self::TooLarge,
            _ => {
                // serde messages can echo the submitted value; keep only a field name, if there is one.
                let text = r.body_text();
                let field = text
                    .split_once("target type: ")
                    .and_then(|(_, rest)| rest.split_once(": "))
                    .map(|(f, _)| f)
                    .filter(|f| {
                        !f.is_empty() && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                    })
                    .unwrap_or("body");
                Self::Validation(format!("{field}: invalid JSON or wrong field type"))
            }
        }
    }
}

impl From<QueryRejection> for AppError {
    fn from(r: QueryRejection) -> Self {
        Self::Validation(r.body_text())
    }
}

impl From<PathRejection> for AppError {
    fn from(_: PathRejection) -> Self {
        // Never echo the parser's text; every path parameter in the API is an id.
        Self::Validation("id: not a valid id.".into())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_validation_maps_to_400() {
        let e = AppError::from(domain::DomainError::validation("title: required"));
        assert!(matches!(&e, AppError::Validation(m) if m == "title: required"));
        assert_eq!(e.into_response().status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn domain_unauthenticated_keeps_its_message() {
        let e = AppError::from(domain::DomainError::Unauthenticated("Please sign in."));
        assert_eq!(e.to_string(), "Please sign in.");
    }

    #[test]
    fn every_domain_error_keeps_its_status_and_code() {
        use domain::DomainError as D;
        let m = || "m".to_string();
        for (e, status, code) in [
            (D::Validation(m()), 400, "validation"),
            (D::NotFound(m()), 404, "not_found"),
            (D::Conflict(m()), 409, "conflict"),
            (D::Forbidden(m()), 403, "forbidden"),
            (
                D::Unauthenticated("Wrong username or password."),
                401,
                "unauthenticated",
            ),
            (D::AiDisabled, 422, "ai_disabled"),
            (D::Ai(m()), 502, "ai_error"),
            (D::NoRecipeFound(m()), 422, "no_recipe_found"),
            (D::BlockedAddress, 422, "blocked_address"),
            (D::SiteBlocked(m()), 502, "site_blocked"),
            (D::FetchFailed(m()), 502, "fetch_failed"),
            (D::Internal(m()), 500, "internal"),
        ] {
            let (s, c) = AppError::from(e).status_and_code();
            let c = serde_json::to_value(c).unwrap();
            assert_eq!((s.as_u16(), c.as_str().unwrap()), (status, code));
        }
    }
}
