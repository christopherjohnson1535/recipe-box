//! Image processing and storage orchestration. Path-free: it sees only the `ImageRepo` and `MediaStore` ports.

use std::io::Cursor;

use anyhow::anyhow;
use image::{
    DynamicImage, ImageDecoder, ImageReader, RgbImage, codecs::jpeg::JpegEncoder,
    imageops::FilterType,
};
use ports::{ImageRepo, MediaStore};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    import::photo,
    models::{Image, media_url},
    plate,
};

pub const MAX_EDGE: u32 = 2400;
const JPEG_QUALITY: u8 = 85;
const DISPLAY_QUALITY: u8 = 82;
/// Decode bounds (S-01): per side, total pixels, and bytes the decoder may allocate.
const MAX_SIDE_PX: u32 = 10_000;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_DECODE_ALLOC: u64 = 256 << 20;

/// Decodes, re-encodes and stores an uploaded image, returning its row and the stored JPEG bytes (photo import
/// sends them to the AI provider).
pub async fn store_jpeg(
    images: &dyn ImageRepo,
    media: &dyn MediaStore,
    user_id: Uuid,
    mut data: Vec<u8>,
) -> AppResult<(Image, Vec<u8>)> {
    if photo::is_heic(&data) {
        data = photo::heic_to_png(&data).await?;
    }
    let id = Uuid::new_v4();
    let (jpeg, display) = tokio::task::spawn_blocking(move || {
        let jpeg = reencode(&data)?;
        // A rendition that fails must not fail the upload: the original is what matters.
        let display = display_jpeg(&jpeg.bytes, id)
            .map_err(|e| tracing::warn!(%id, error = ?e, "could not make the display rendition"))
            .ok();
        AppResult::Ok((jpeg, display))
    })
    .await
    .map_err(|e| anyhow!(e))??;
    let file_name = format!("{id}.jpg");
    media.put(&file_name, jpeg.bytes.clone()).await?;
    let display_name = format!("{id}.display.jpg");
    let display_name = match display {
        Some(bytes) => media
            .put(&display_name, bytes)
            .await
            .map_err(|e| tracing::warn!(%id, error = %e, "could not write the display rendition"))
            .ok()
            .map(|()| display_name),
        None => None,
    };
    let inserted = images
        .add(domain::Image {
            id,
            file_name: file_name.clone(),
            display_file_name: display_name.clone(),
            width: jpeg.width as i32,
            height: jpeg.height as i32,
            bytes: jpeg.bytes.len() as i32,
            created_by: Some(user_id),
        })
        .await;
    if let Err(e) = inserted {
        let _ = media.delete(&file_name).await;
        let _ = media.delete(&format!("{id}.display.jpg")).await;
        return Err(e.into());
    }
    let image = Image {
        id,
        url: media_url(&file_name),
        display_url: display_name.as_deref().map(media_url),
        width: jpeg.width as i32,
        height: jpeg.height as i32,
    };
    Ok((image, jpeg.bytes))
}

/// Deletes images stored by a request that then failed (row and blobs); best effort.
pub async fn delete_images(images: &dyn ImageRepo, media: &dyn MediaStore, ids: &[Uuid]) {
    if images.delete(ids).await.is_err() {
        tracing::warn!("could not delete images of a failed request");
        return;
    }
    for id in ids {
        for name in [format!("{id}.jpg"), format!("{id}.display.jpg")] {
            let _ = media.delete(&name).await;
        }
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

/// Decodes within the bounds above and applies the EXIF orientation.
fn decode(data: &[u8]) -> AppResult<DynamicImage> {
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
    Ok(img)
}

fn encode_jpeg(rgb: &RgbImage, quality: u8) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, quality)
        .encode_image(rgb)
        .map_err(|e| anyhow!("encode jpeg: {e}"))?;
    Ok(bytes)
}

/// JPEG/PNG/WebP/GIF in → EXIF-oriented, long edge ≤ [`MAX_EDGE`], JPEG q85 out.
pub fn reencode(data: &[u8]) -> AppResult<Jpeg> {
    let mut img = decode(data)?;
    if img.width().max(img.height()) > MAX_EDGE {
        img = img.resize(MAX_EDGE, MAX_EDGE, FilterType::CatmullRom);
    }
    // shortcut: transparent pixels flatten to their stored colour (often black), composite onto white if users mind.
    let rgb = img.to_rgb8();
    Ok(Jpeg {
        bytes: encode_jpeg(&rgb, JPEG_QUALITY)?,
        width: rgb.width(),
        height: rgb.height(),
    })
}

/// The print-style rendition (JPEG q82) of a stored original; the seed comes from the image id.
fn display_jpeg(original: &[u8], id: Uuid) -> AppResult<Vec<u8>> {
    let plate = plate::render_plate(&decode(original)?.to_rgb8(), plate::seed_for(id));
    encode_jpeg(&plate, DISPLAY_QUALITY)
}

/// Makes and stores the rendition of one image whose original is stored, if it has none yet. Returns false when
/// the image row is gone (or was rendered meanwhile) and the file just written was removed again.
pub async fn render_display(
    images: &dyn ImageRepo,
    media: &dyn MediaStore,
    id: Uuid,
) -> AppResult<bool> {
    let original = media
        .get(&format!("{id}.jpg"))
        .await?
        .ok_or_else(|| anyhow!("read original of {id}: not found"))?;
    let bytes = tokio::task::spawn_blocking(move || display_jpeg(&original, id))
        .await
        .map_err(|e| anyhow!(e))??;
    let name = format!("{id}.display.jpg");
    media.put(&name, bytes).await?;
    if images.set_display_file(id, &name).await? {
        return Ok(true);
    }
    // The row was deleted meanwhile, or already has another rendition: the file just written is an orphan.
    let _ = media.delete(&name).await;
    Ok(false)
}

/// Gives every image without a rendition one, one at a time; returns how many were made. An image that cannot be
/// read is logged and skipped (it is tried again on the next start). Safe to run on every start.
pub async fn backfill_displays(images: &dyn ImageRepo, media: &dyn MediaStore) -> u64 {
    let ids = match images.without_display_file().await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "display backfill: could not list images");
            return 0;
        }
    };
    let mut made = 0;
    for id in ids {
        match render_display(images, media, id).await {
            Ok(true) => made += 1,
            Ok(false) => {}
            Err(e) => tracing::warn!(%id, error = ?e, "display backfill: skipped an image"),
        }
    }
    tracing::info!(made, "display backfill done");
    made
}

#[cfg(test)]
mod tests {
    use super::*;

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
