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

    /// Re-encodes and stores an upload and returns its row. `UnsupportedMedia` for a non-image.
    pub async fn upload(&self, user_id: Uuid, data: Vec<u8>) -> DomainResult<Image> {
        Ok(self.store_jpeg(user_id, data).await?.0)
    }

    /// Like [`MediaService::upload`], also returning the stored JPEG (photo import sends it to the AI provider).
    ///
    /// A rendition that could not be made or written leaves the image without one (the original is what
    /// matters; the backfill retries); it is not reported. If the row cannot be saved, both files are removed
    /// again and the error returned.
    pub async fn store_jpeg(&self, user_id: Uuid, data: Vec<u8>) -> DomainResult<(Image, Vec<u8>)> {
        let id = Uuid::new_v4();
        let encoded = self.codec.encode(id, data).await?;
        let file_name = original_name(id);
        self.media.put(&file_name, encoded.jpeg.clone()).await?;
        let display_file_name = match encoded.display {
            Some(bytes) => {
                let name = display_name(id);
                self.media.put(&name, bytes).await.ok().map(|()| name)
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
        Ok((make(), encoded.jpeg))
    }

    /// Deletes images stored by a request that then failed (row and files). Best effort: nothing is reported.
    pub async fn delete_images(&self, ids: &[Uuid]) {
        if self.images.delete(ids).await.is_err() {
            return;
        }
        for id in ids {
            for name in [original_name(*id), display_name(*id)] {
                let _ = self.media.delete(&name).await;
            }
        }
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
