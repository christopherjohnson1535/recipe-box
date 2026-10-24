use std::sync::Arc;

use domain::{DomainError, DomainResult, Image, uuid::Uuid, validate};
use ports::{ImageCodec, ImageRepo, MediaStore};

use crate::Deps;

pub(crate) fn original_name(id: Uuid) -> String {
    format!("{id}.jpg")
}

pub(crate) fn display_name(id: Uuid) -> String {
    format!("{id}.display.jpg")
}

/// A stored upload. `rendition_error` is why the display rendition could not be written (the image is kept
/// without one and the backfill retries); the caller logs it, this crate does not.
pub struct Stored {
    pub image: Image,
    /// The stored (re-encoded) JPEG; photo import sends it to the AI provider.
    pub jpeg: Vec<u8>,
    pub rendition_error: Option<DomainError>,
}

/// Uploaded images: the row in the [`ImageRepo`], the files in the [`MediaStore`].
#[derive(Clone)]
pub struct MediaService {
    images: Arc<dyn ImageRepo>,
    media: Arc<dyn MediaStore>,
    codec: Arc<dyn ImageCodec>,
}

impl MediaService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            images: d.images.clone(),
            media: d.media.clone(),
            codec: d.codec.clone(),
        }
    }

    /// Re-encodes and stores an upload and returns it with its row. `UnsupportedMedia` for a non-image.
    ///
    /// A rendition that could not be made leaves the image without one (the original is what matters; the
    /// backfill retries); one that could not be written is reported in [`Stored::rendition_error`]. If the row
    /// cannot be saved, both files are removed again and the error returned.
    pub async fn upload(&self, user_id: Uuid, data: Vec<u8>) -> DomainResult<Stored> {
        let id = Uuid::new_v4();
        let encoded = self.codec.encode(id, data).await?;
        let file_name = original_name(id);
        self.media.put(&file_name, encoded.jpeg.clone()).await?;
        let mut rendition_error = None;
        let display_file_name = match encoded.display {
            Some(bytes) => {
                let name = display_name(id);
                match self.media.put(&name, bytes).await {
                    Ok(()) => Some(name),
                    Err(e) => {
                        rendition_error = Some(e);
                        None
                    }
                }
            }
            None => None,
        };
        let make = || Image {
            id,
            file_name: file_name.clone(),
            display_file_name: display_file_name.clone(),
            width: encoded.width as i32,
            height: encoded.height as i32,
            bytes: encoded.jpeg.len() as i32,
            created_by: Some(user_id),
        };
        if let Err(e) = self.images.add(make()).await {
            let _ = self.media.delete(&file_name).await;
            let _ = self.media.delete(&display_name(id)).await;
            return Err(e);
        }
        Ok(Stored {
            image: make(),
            jpeg: encoded.jpeg,
            rendition_error,
        })
    }

    /// Deletes images stored by a request that then failed (row and files). Best effort; `false` when the rows
    /// could not be deleted (the files are then kept), which the caller logs.
    pub async fn delete_images(&self, ids: &[Uuid]) -> bool {
        if self.images.delete(ids).await.is_err() {
            return false;
        }
        for id in ids {
            for name in [original_name(*id), display_name(*id)] {
                let _ = self.media.delete(&name).await;
            }
        }
        true
    }

    /// The bytes of a stored file. A name the store would not hold, or a missing file: `NotFound`.
    pub async fn get(&self, file_name: &str) -> DomainResult<Vec<u8>> {
        let not_found = || DomainError::NotFound("Image not found.".into());
        if !validate::media_file_name(file_name) {
            return Err(not_found());
        }
        self.media.get(file_name).await?.ok_or_else(not_found)
    }
}
