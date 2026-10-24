//! Image processing: the `ImageCodec` port on the `image` crate. Decodes within hard bounds, re-encodes as JPEG and
//! makes the print-style rendition. Storage and the rules around it are `app::MediaService`'s.

use std::io::Cursor;

use anyhow::anyhow;
use async_trait::async_trait;
use domain::{DomainError, DomainResult};
use image::{
    DynamicImage, ImageDecoder, ImageReader, RgbImage, codecs::jpeg::JpegEncoder,
    imageops::FilterType,
};
use ports::{EncodedImage, ImageCodec};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    import::photo,
    plate,
};

pub const MAX_EDGE: u32 = 2400;
const JPEG_QUALITY: u8 = 85;
const DISPLAY_QUALITY: u8 = 82;
/// Decode bounds (S-01): per side, total pixels, and bytes the decoder may allocate.
const MAX_SIDE_PX: u32 = 10_000;
const MAX_PIXELS: u64 = 40_000_000;
const MAX_DECODE_ALLOC: u64 = 256 << 20;

/// The `image` crate (plus `heif-convert` for HEIC) behind the port.
pub struct ImageCrateCodec;

/// Port errors carry no HTTP type: an unreadable image stays `UnsupportedMedia`, anything else is infrastructure.
fn domain_error(e: AppError) -> DomainError {
    match e {
        AppError::UnsupportedMedia(m) => DomainError::UnsupportedMedia(m),
        AppError::Internal(e) => DomainError::Internal(format!("{e:#}")),
        other => DomainError::Internal(other.to_string()),
    }
}

fn join_error(e: tokio::task::JoinError) -> DomainError {
    DomainError::Internal(e.to_string())
}

#[async_trait]
impl ImageCodec for ImageCrateCodec {
    async fn encode(&self, id: Uuid, mut data: Vec<u8>) -> DomainResult<EncodedImage> {
        if photo::is_heic(&data) {
            data = photo::heic_to_png(&data).await.map_err(domain_error)?;
        }
        tokio::task::spawn_blocking(move || {
            let jpeg = reencode(&data).map_err(domain_error)?;
            // A rendition that fails must not fail the upload: the original is what matters.
            let display = display_jpeg(&jpeg.bytes, id)
                .map_err(
                    |e| tracing::warn!(%id, error = ?e, "could not make the display rendition"),
                )
                .ok();
            Ok(EncodedImage {
                jpeg: jpeg.bytes,
                width: jpeg.width,
                height: jpeg.height,
                display,
            })
        })
        .await
        .map_err(join_error)?
    }

    async fn render_display(&self, id: Uuid, jpeg: Vec<u8>) -> DomainResult<Vec<u8>> {
        tokio::task::spawn_blocking(move || display_jpeg(&jpeg, id))
            .await
            .map_err(join_error)?
            .map_err(domain_error)
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
