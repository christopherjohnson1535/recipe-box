//! HEIC/HEIF photos (PHO-1): iPhones and iPads save these by default, and the `image` crate cannot read them.
//! They are decoded to PNG by libheif's `heif-convert` in a child process, so a malformed file can crash or hang
//! only the child, and the Rust build needs no C bindings. The PNG then goes through the normal bounded re-encode.

use std::{path::PathBuf, process::Stdio, sync::OnceLock, time::Duration};

use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    routes::media::check_dimensions,
};

const DECODE_TIMEOUT: Duration = Duration::from_secs(30);
/// Decoders running at once; a heif-convert child can use a few hundred MB.
static SLOTS: Semaphore = Semaphore::const_new(2);
/// Address-space cap for the child (bytes), applied with `prlimit` when it is installed.
const CHILD_MEMORY: u64 = 1 << 30;
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

/// The ISO-BMFF boxes in `data` as (type, payload).
fn boxes(mut data: &[u8]) -> impl Iterator<Item = ([u8; 4], &[u8])> {
    std::iter::from_fn(move || {
        let head = data.get(..8)?;
        let size = u32::from_be_bytes(head[..4].try_into().ok()?);
        let (skip, len) = match size {
            0 => (8, data.len()),
            1 => (
                16,
                usize::try_from(u64::from_be_bytes(data.get(8..16)?.try_into().ok()?)).ok()?,
            ),
            n => (8, n as usize),
        };
        let payload = data.get(skip..len)?;
        data = &data[len..];
        Some((head[4..8].try_into().ok()?, payload))
    })
}

fn find_box<'a>(inside: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    boxes(inside).find(|b| &b.0 == kind).map(|b| b.1)
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

/// Width and height of the primary image, read from the file's boxes without decoding anything.
/// shortcut: parsed by hand (`meta` > `pitm`, `iprp` > `ipma` + `ipco` > `ispe`) because `heif-info` output differs
/// between libheif 1.15 (the image) and 1.17 (CI); this is short and cannot drift. Files it cannot read are refused.
fn primary_size(data: &[u8]) -> Option<(u32, u32)> {
    let meta = boxes(data).find(|b| &b.0 == b"meta")?.1.get(4..)?; // full box: skip version and flags
    let pitm = find_box(meta, b"pitm")?;
    let primary = if *pitm.first()? == 0 {
        u32::from(u16::from_be_bytes(pitm.get(4..6)?.try_into().ok()?))
    } else {
        be32(pitm, 4)?
    };
    let iprp = find_box(meta, b"iprp")?;
    let ipco = find_box(iprp, b"ipco")?;
    let ipma = find_box(iprp, b"ipma")?;
    let (version, flags) = (*ipma.first()?, *ipma.get(3)?);
    let (mut at, entries) = (8, be32(ipma, 4)?);
    for _ in 0..entries {
        let id = if version == 0 {
            at += 2;
            u32::from(u16::from_be_bytes(ipma.get(at - 2..at)?.try_into().ok()?))
        } else {
            at += 4;
            be32(ipma, at - 4)?
        };
        let count = *ipma.get(at)?;
        at += 1;
        for _ in 0..count {
            let index = if flags & 1 == 1 {
                at += 2;
                u16::from_be_bytes(ipma.get(at - 2..at)?.try_into().ok()?) & 0x7FFF
            } else {
                at += 1;
                u16::from(*ipma.get(at - 1)? & 0x7F)
            };
            if id == primary && index > 0 {
                let (kind, ispe) = boxes(ipco).nth(usize::from(index) - 1)?;
                if &kind == b"ispe" {
                    return Some((be32(ispe, 4)?, be32(ispe, 8)?));
                }
            }
        }
    }
    None
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

fn prlimit_installed() -> bool {
    static FOUND: OnceLock<bool> = OnceLock::new();
    *FOUND.get_or_init(|| {
        let found = std::env::var_os("PATH")
            .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join("prlimit").is_file()));
        if !found {
            tracing::warn!("prlimit not found; heif-convert runs without a memory cap");
        }
        found
    })
}

/// Decodes a HEIC/HEIF image to PNG bytes with `heif-convert` (`HEIF_CONVERT` env var, default `heif-convert`).
pub async fn heic_to_png(data: &[u8]) -> AppResult<Vec<u8>> {
    // A tiny file can claim a huge canvas and make libheif allocate gigabytes: bound it before decoding (S-01).
    let (w, h) = primary_size(data).ok_or_else(unreadable)?;
    check_dimensions(w, h)?;
    let _slot = SLOTS.acquire().await.map_err(|e| anyhow::anyhow!(e))?;

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

    // Belt and braces: cap the child's address space with util-linux `prlimit` (no shell); without it, run bare.
    let mut cmd = if prlimit_installed() {
        let mut c = tokio::process::Command::new("prlimit");
        c.arg(format!("--as={CHILD_MEMORY}")).arg("--").arg(bin);
        c
    } else {
        tokio::process::Command::new(bin)
    };
    let run = cmd
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
