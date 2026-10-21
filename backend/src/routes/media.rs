use std::io::Cursor;

use anyhow::anyhow;
use axum::{
    Json,
    extract::{Multipart, State},
    http::{StatusCode, header},
    response::IntoResponse,
};
use image::{
    DynamicImage, ImageDecoder, ImageReader, codecs::jpeg::JpegEncoder, imageops::FilterType,
};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppPath, AppResult},
    models::{Image, media_url},
    state::AppState,
};

pub const MAX_EDGE: u32 = 2400;
const JPEG_QUALITY: u8 = 85;

/// `POST /api/media`, multipart field `file`. The image is decoded and re-encoded, never stored as sent.
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
    let jpeg = tokio::task::spawn_blocking(move || reencode(&data))
        .await
        .map_err(|e| anyhow!(e))??;
    let id = Uuid::new_v4();
    let file_name = format!("{id}.jpg");
    let path = state.config.media_dir.join(&file_name);
    tokio::fs::write(&path, &jpeg.bytes)
        .await
        .map_err(|e| anyhow!("write {}: {e}", path.display()))?;
    let inserted = sqlx::query(
        "insert into images (id, file_name, width, height, bytes, created_by) values ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(&file_name)
    .bind(jpeg.width as i32)
    .bind(jpeg.height as i32)
    .bind(jpeg.bytes.len() as i32)
    .bind(user_id)
    .execute(&state.pool)
    .await;
    if let Err(e) = inserted {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e.into());
    }
    Ok(Image {
        id,
        url: media_url(&file_name),
        width: jpeg.width as i32,
        height: jpeg.height as i32,
    })
}

pub struct Jpeg {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// JPEG/PNG/WebP/GIF in → EXIF-oriented, long edge ≤ [`MAX_EDGE`], JPEG q85 out.
pub fn reencode(data: &[u8]) -> AppResult<Jpeg> {
    let unsupported = || {
        AppError::UnsupportedMedia(
            "That file is not an image we can read (JPEG, PNG, WebP or GIF).".into(),
        )
    };
    let reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|_| unsupported())?;
    let mut decoder = reader.into_decoder().map_err(|_| unsupported())?;
    let orientation = decoder.orientation().map_err(|_| unsupported())?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|_| unsupported())?;
    img.apply_orientation(orientation);
    if img.width().max(img.height()) > MAX_EDGE {
        img = img.resize(MAX_EDGE, MAX_EDGE, FilterType::CatmullRom);
    }
    // shortcut: transparent pixels flatten to their stored colour (often black), composite onto white if users mind.
    let rgb = img.to_rgb8();
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|e| anyhow!("encode jpeg: {e}"))?;
    Ok(Jpeg {
        bytes,
        width: rgb.width(),
        height: rgb.height(),
    })
}

/// `GET /media/:fileName`, session required.
pub async fn serve(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppPath(file_name): AppPath<String>,
) -> AppResult<impl IntoResponse> {
    if !valid_file_name(&file_name) {
        return Err(AppError::NotFound("Image not found.".into()));
    }
    let bytes = match tokio::fs::read(state.config.media_dir.join(&file_name)).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::NotFound("Image not found.".into()));
        }
        Err(e) => return Err(anyhow!("read {file_name}: {e}").into()),
    };
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

/// `^[0-9a-f-]{36}\.jpg$` — also keeps paths inside `MEDIA_DIR`.
fn valid_file_name(name: &str) -> bool {
    name.strip_suffix(".jpg").is_some_and(|stem| {
        stem.len() == 36
            && stem
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f' | b'-'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_rule() {
        assert!(valid_file_name("0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.jpg"));
        assert!(!valid_file_name("0B6A4B0E-3A8E-4A8F-9A5E-2F1F3C1D2E4F.jpg"));
        assert!(!valid_file_name("../../../../../../../../etc/passwd.jpg"));
        assert!(!valid_file_name("0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f.png"));
        assert!(!valid_file_name(".jpg"));
    }

    #[test]
    fn reencode_resizes_and_rejects_garbage() {
        let big = DynamicImage::new_rgb8(3000, 1000);
        let mut png = Vec::new();
        big.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let out = reencode(&png).unwrap();
        assert_eq!((out.width, out.height), (2400, 800));
        assert_eq!(&out.bytes[..2], &[0xFF, 0xD8]);
        assert!(matches!(
            reencode(b"not an image"),
            Err(AppError::UnsupportedMedia(_))
        ));
    }
}
