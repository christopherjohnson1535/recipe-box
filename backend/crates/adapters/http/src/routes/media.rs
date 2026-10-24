use app::{MediaService, Stored};
use axum::{
    Json,
    extract::{Multipart, State},
    http::{StatusCode, header},
    response::IntoResponse,
};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    HttpState,
    dto::{BinaryFile, Image},
    error::{AppError, AppPath, AppResult, ErrorBody},
    extract::CurrentUser,
};

/// Logs a rendition that could not be written (the app crate reports it, this adapter logs). Every caller of
/// `MediaService::upload` calls this.
pub fn log_rendition_error(stored: &Stored) {
    if let Some(e) = &stored.rendition_error {
        tracing::warn!(id = %stored.image.id, error = %e, "could not write the display rendition");
    }
}

/// `MediaService::delete_images`, logging when the rows could not be deleted.
pub async fn delete_images(media: &MediaService, ids: &[Uuid]) {
    if !media.delete_images(ids).await {
        tracing::warn!("could not delete images of a failed request");
    }
}

/// Multipart body of `POST /api/media`.
#[derive(ToSchema)]
#[allow(dead_code)] // schema only; the handler reads the multipart stream itself
pub struct UploadForm {
    /// JPEG, PNG, WebP, GIF or HEIC.
    #[schema(value_type = String, format = Binary)]
    file: Vec<u8>,
}

/// Uploads an image. It is decoded and re-encoded (JPEG, long edge at most 2400 px), never stored as sent.
#[utoipa::path(post, path = "/api/media", operation_id = "uploadMedia", tag = "media", security(("session" = [])),
    request_body(content = UploadForm, content_type = "multipart/form-data"), responses(
    (status = 201, description = "The stored image.", body = Image),
    (status = 400, description = "Missing `file` field (`validation`).", body = ErrorBody),
    (status = 413, description = "Over `MAX_UPLOAD_MB` (`too_large`).", body = ErrorBody),
    (status = 415, description = "Not a readable image, or over 10,000 px a side or 40 megapixels (`unsupported_media`).", body = ErrorBody),
))]
pub async fn upload(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<Image>)> {
    let mut data = None;
    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("file") {
            data = Some(field.bytes().await?);
            break;
        }
    }
    let data = data.ok_or_else(|| AppError::validation("file: missing."))?;
    if data.len() > state.config.max_upload_bytes {
        return Err(AppError::TooLarge);
    }
    let stored = state.services.media.upload(user.id, data.to_vec()).await?;
    log_rendition_error(&stored);
    Ok((StatusCode::CREATED, Json(stored.image.into())))
}

/// A stored image.
#[utoipa::path(get, path = "/media/{file_name}", operation_id = "getMedia", tag = "media", security(("session" = [])),
    params(("file_name" = String, Path, description = "`<uuid>.jpg` (the original) or `<uuid>.display.jpg` (the print-style rendition)")), responses(
    (status = 200, description = "The JPEG.", content_type = "image/jpeg", body = BinaryFile,
        headers(("Cache-Control" = String, description = "`private, max-age=31536000, immutable`"))),
    (status = 404, description = "No such image (`not_found`).", body = ErrorBody),
))]
pub async fn serve(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppPath(file_name): AppPath<String>,
) -> AppResult<impl IntoResponse> {
    let bytes = state.services.media.get(&file_name).await?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/jpeg"),
            (
                header::CACHE_CONTROL,
                "private, max-age=31536000, immutable",
            ),
        ],
        bytes,
    ))
}
