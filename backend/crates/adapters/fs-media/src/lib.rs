//! `MediaStore` on a flat directory. Names are checked by the domain rule, so nothing can leave the root.

use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use domain::{DomainError, DomainResult, uuid::Uuid, validate::media_file_name};
use ports::MediaStore;

pub struct FsMediaStore {
    root: PathBuf,
}

impl FsMediaStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn path(&self, name: &str) -> DomainResult<PathBuf> {
        if !media_file_name(name) {
            return Err(DomainError::validation(format!(
                "media file name: {name:?} is not allowed."
            )));
        }
        Ok(self.root.join(name))
    }
}

fn internal(op: &str, name: &str, e: std::io::Error) -> DomainError {
    DomainError::Internal(format!("{op} {name}: {e}"))
}

#[async_trait]
impl MediaStore for FsMediaStore {
    async fn put(&self, name: &str, bytes: Vec<u8>) -> DomainResult<()> {
        let path = self.path(name)?;
        // The leading dot and `.tmp` suffix can never pass the name rule, so a temp file is never served.
        let tmp = self.root.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
        let written = write_then_rename(&tmp, &path, &bytes).await;
        if written.is_err() {
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        written.map_err(|e| internal("write", name, e))
    }

    async fn get(&self, name: &str) -> DomainResult<Option<Vec<u8>>> {
        match tokio::fs::read(self.path(name)?).await {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(e) => Err(internal("read", name, e)),
        }
    }

    async fn delete(&self, name: &str) -> DomainResult<()> {
        match tokio::fs::remove_file(self.path(name)?).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(e) => Err(internal("delete", name, e)),
        }
    }
}

async fn write_then_rename(tmp: &Path, path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    tokio::fs::write(tmp, bytes).await?;
    tokio::fs::rename(tmp, path).await
}
