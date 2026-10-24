use axum::{
    Json,
    extract::{Multipart, State},
    http::{StatusCode, header},
    response::IntoResponse,
};
use domain::validate::media_file_name;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppPath, AppResult, ErrorBody},
    media,
    models::{BinaryFile, Image},
    state::AppState,
};

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
    State(state): State<AppState>,
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
    if data.len() > state.config.max_upload_bytes() {
        return Err(AppError::TooLarge);
    }
    let image = store_image(&state, user.id, data.to_vec()).await?;
    Ok((StatusCode::CREATED, Json(image)))
}

/// Decodes, re-encodes and stores an uploaded image, returning its row. Shared with photo import.
pub async fn store_image(state: &AppState, user_id: Uuid, data: Vec<u8>) -> AppResult<Image> {
    Ok(store_jpeg(state, user_id, data).await?.0)
}

/// Like [`store_image`], also returning the stored JPEG bytes (photo import sends them to the AI provider).
pub async fn store_jpeg(
    state: &AppState,
    user_id: Uuid,
    data: Vec<u8>,
) -> AppResult<(Image, Vec<u8>)> {
    media::store_jpeg(state.images.as_ref(), state.media.as_ref(), user_id, data).await
}

/// Deletes images stored by a request that then failed (row and file); best effort.
pub async fn delete_images(state: &AppState, ids: &[Uuid]) {
    media::delete_images(state.images.as_ref(), state.media.as_ref(), ids).await
}

/// A stored image.
#[utoipa::path(get, path = "/media/{file_name}", operation_id = "getMedia", tag = "media", security(("session" = [])),
    params(("file_name" = String, Path, description = "`<uuid>.jpg` (the original) or `<uuid>.display.jpg` (the print-style rendition)")), responses(
    (status = 200, description = "The JPEG.", content_type = "image/jpeg", body = BinaryFile,
        headers(("Cache-Control" = String, description = "`private, max-age=31536000, immutable`"))),
    (status = 404, description = "No such image (`not_found`).", body = ErrorBody),
))]
pub async fn serve(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppPath(file_name): AppPath<String>,
) -> AppResult<impl IntoResponse> {
    if !media_file_name(&file_name) {
        return Err(AppError::NotFound("Image not found.".into()));
    }
    let bytes = state
        .media
        .get(&file_name)
        .await?
        .ok_or_else(|| AppError::NotFound("Image not found.".into()))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_rule() {
        assert!(media_file_name("0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.jpg"));
        assert!(!media_file_name("0B6A4B0E-3A8E-4A8F-9A5E-2F1F3C1D2E4F.jpg"));
        assert!(!media_file_name("../../../../../../../../etc/passwd.jpg"));
        assert!(!media_file_name("0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.png"));
        assert!(!media_file_name(".jpg"));
        assert!(media_file_name(
            "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.display.jpg"
        ));
        for bad in [
            "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.display.png",
            "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.display.display.jpg",
            "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.Display.jpg",
            "../0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.display.jpg",
            "../../../../../../../../etc/passwd.display.jpg",
            "..%2f..%2fx.display.jpg",
            ".display.jpg",
            "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4.display.jpg",
        ] {
            assert!(!media_file_name(bad), "{bad}");
        }
    }
}
