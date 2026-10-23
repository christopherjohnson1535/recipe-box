//! HEIC/HEIF photos (PHO-1): iPhones and iPads save these by default, and the `image` crate cannot read them.
//! They are decoded to PNG by libheif's `heif-convert` in a child process, so a malformed file can crash or hang
//! only the child, and the Rust build needs no C bindings. The PNG then goes through the normal bounded re-encode.

use std::{path::PathBuf, process::Stdio, sync::OnceLock, time::Duration};

use uuid::Uuid;

use crate::error::{AppError, AppResult};

const DECODE_TIMEOUT: Duration = Duration::from_secs(30);
/// Brands (major or compatible) of the ISO-BMFF `ftyp` box that mean "HEIF image".
const BRANDS: [&[u8; 4]; 8] = [
    b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1",
];

/// True when the bytes start with an ISO-BMFF `ftyp` box naming a HEIF brand.
pub fn is_heic(data: &[u8]) -> bool {
    if data.len() < 16 || &data[4..8] != b"ftyp" {
        return false;
    }
    let size = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let end = size.clamp(16, data.len());
    // Major brand at 8, minor version at 12, then compatible brands.
    let brands = std::iter::once(&data[8..12]).chain(data[16..end].chunks_exact(4));
    brands
        .into_iter()
        .any(|b| BRANDS.iter().any(|k| &k[..] == b))
}

/// Removes the temp dir when dropped, whatever path the decode took.
struct TempDir(PathBuf);

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn unreadable() -> AppError {
    AppError::UnsupportedMedia("That HEIC photo could not be read.".into())
}

/// Decodes a HEIC/HEIF image to PNG bytes with `heif-convert` (`HEIF_CONVERT` env var, default `heif-convert`).
pub async fn heic_to_png(data: &[u8]) -> AppResult<Vec<u8>> {
    static BIN: OnceLock<String> = OnceLock::new();
    let bin =
        BIN.get_or_init(|| std::env::var("HEIF_CONVERT").unwrap_or_else(|_| "heif-convert".into()));

    let dir = std::env::temp_dir().join(format!("rb-heic-{}", Uuid::new_v4()));
    tokio::fs::DirBuilder::new()
        .mode(0o700)
        .create(&dir)
        .await
        .map_err(|e| anyhow::anyhow!("create {}: {e}", dir.display()))?;
    let dir = TempDir(dir);
    let (input, output) = (dir.0.join("in.heic"), dir.0.join("out.png"));
    tokio::fs::write(&input, data)
        .await
        .map_err(|e| anyhow::anyhow!("write {}: {e}", input.display()))?;

    // shortcut: the child has no memory or CPU cap beyond the 30 s timeout; add a cgroup/ulimit if hostile
    // uploads ever matter (the upload size cap and the pixel bounds on the PNG still apply).
    let run = tokio::process::Command::new(bin)
        .arg(&input)
        .arg(&output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .status();
    match tokio::time::timeout(DECODE_TIMEOUT, run).await {
        Ok(Ok(status)) if status.success() => {}
        Ok(Ok(status)) => {
            tracing::info!(%status, "heif-convert failed");
            return Err(unreadable());
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, bin, "cannot run heif-convert; is libheif-examples installed?");
            return Err(unreadable());
        }
        Err(_) => {
            tracing::warn!("heif-convert timed out");
            return Err(unreadable());
        }
    }
    // A file with several top-level images is written as out-1.png, out-2.png, ...; the first is the primary.
    match tokio::fs::read(&output).await {
        Ok(png) => Ok(png),
        Err(_) => tokio::fs::read(dir.0.join("out-1.png"))
            .await
            .map_err(|_| unreadable()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ftyp(major: &[u8; 4], compat: &[&[u8; 4]]) -> Vec<u8> {
        let mut b = vec![0, 0, 0, (16 + 4 * compat.len()) as u8];
        b.extend(b"ftyp");
        b.extend(major);
        b.extend([0; 4]);
        compat.iter().for_each(|c| b.extend(*c));
        b
    }

    #[test]
    fn detects_heif_brands() {
        assert!(is_heic(&ftyp(b"heic", &[])));
        assert!(is_heic(&ftyp(b"isom", &[b"iso2", b"mif1"])));
        assert!(!is_heic(&ftyp(b"isom", &[b"mp41"])));
        assert!(!is_heic(b"\xFF\xD8\xFF\xE0 not a heic at all"));
        assert!(!is_heic(b"short"));
    }
}
