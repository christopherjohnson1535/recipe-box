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
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppPath, AppResult, ErrorBody},
    import::photo,
    models::{BinaryFile, Image, media_url},
    state::AppState,
};

pub const MAX_EDGE: u32 = 2400;
const JPEG_QUALITY: u8 = 85;
/// Decode bounds (S-01): per side, total pixels, and bytes the decoder may allocate.
const MAX_SIDE_PX: u32 = 10_000;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_DECODE_ALLOC: u64 = 256 << 20;

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
    mut data: Vec<u8>,
) -> AppResult<(Image, Vec<u8>)> {
    if photo::is_heic(&data) {
        data = photo::heic_to_png(&data).await?;
    }
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
    let image = Image {
        id,
        url: media_url(&file_name),
        width: jpeg.width as i32,
        height: jpeg.height as i32,
    };
    Ok((image, jpeg.bytes))
}

/// Deletes images stored by a request that then failed (row and file); best effort.
pub async fn delete_images(state: &AppState, ids: &[Uuid]) {
    if sqlx::query("delete from images where id = any($1)")
        .bind(ids)
        .execute(&state.pool)
        .await
        .is_err()
    {
        tracing::warn!("could not delete images of a failed request");
        return;
    }
    for id in ids {
        let _ = tokio::fs::remove_file(state.config.media_dir.join(format!("{id}.jpg"))).await;
    }
}

pub struct Jpeg {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Refuses a canvas over the decode bounds; call it before any pixel is allocated.
pub fn check_dimensions(w: u32, h: u32) -> AppResult<()> {
    if w > MAX_SIDE_PX || h > MAX_SIDE_PX || u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err(AppError::UnsupportedMedia(
            "That image is too large to read (over 10,000 px a side or 40 megapixels).".into(),
        ));
    }
    Ok(())
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
    // Bound the work before decoding: a tiny file can claim a huge canvas (decompression bomb).
    let (w, h) = decoder.dimensions();
    check_dimensions(w, h)?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_SIDE_PX);
    limits.max_image_height = Some(MAX_SIDE_PX);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    decoder.set_limits(limits).map_err(|_| unsupported())?;
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

/// A stored image.
#[utoipa::path(get, path = "/media/{file_name}", operation_id = "getMedia", tag = "media", security(("session" = [])),
    params(("file_name" = String, Path, description = "`<uuid>.jpg`")), responses(
    (status = 200, description = "The JPEG.", content_type = "image/jpeg", body = BinaryFile,
        headers(("Cache-Control" = String, description = "`private, max-age=31536000, immutable`"))),
    (status = 404, description = "No such image (`not_found`).", body = ErrorBody),
))]
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

    /// A PNG header (valid CRCs) claiming `w`x`h`; the pixel data is absent, so only the bounds can reject it.
    pub(crate) fn png_claiming(w: u32, h: u32) -> Vec<u8> {
        fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
            out.extend((data.len() as u32).to_be_bytes());
            let mut body = kind.to_vec();
            body.extend(data);
            out.extend(&body);
            out.extend(crc32(&body).to_be_bytes());
        }
        fn crc32(data: &[u8]) -> u32 {
            let mut c = !0u32;
            for &b in data {
                c ^= u32::from(b);
                for _ in 0..8 {
                    c = if c & 1 != 0 {
                        0xEDB8_8320 ^ (c >> 1)
                    } else {
                        c >> 1
                    };
                }
            }
            !c
        }
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut ihdr = Vec::new();
        ihdr.extend(w.to_be_bytes());
        ihdr.extend(h.to_be_bytes());
        ihdr.extend([8, 2, 0, 0, 0]);
        chunk(&mut out, b"IHDR", &ihdr);
        chunk(
            &mut out,
            b"IDAT",
            &[0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01],
        );
        chunk(&mut out, b"IEND", &[]);
        out
    }

    #[test]
    fn reencode_refuses_huge_canvases() {
        for (w, h) in [(20_000, 20_000), (10_001, 10), (9_000, 9_000)] {
            assert!(
                matches!(
                    reencode(&png_claiming(w, h)),
                    Err(AppError::UnsupportedMedia(_))
                ),
                "{w}x{h}"
            );
        }
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
