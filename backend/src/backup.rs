//! The backup archive format (ACC-5) as a zip file, behind the [`BackupFormat`] port. The format is documented in
//! docs/API.md ("Backup archive"):
//!
//! ```text
//! media/<image uuid>.jpg   one entry per photo (the original JPEG; renditions are made again on import)
//! recipes.json             {"format":"recipe-box-export","version":1,"exportedAt":..,"recipes":[..]}
//! ```
//!
//! Reading is strict: only those names are accepted (so a path like `../x` or `/etc/passwd` is refused outright and
//! nothing in the archive is ever turned into a path on disk), and the entry count, declared sizes and what each
//! entry really expands to are all capped.

use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use domain::{
    BackupLimits, BackupRecipe, DomainError, DomainResult, Ingredient, RecipeInput, SourceType,
};
use ports::{BackupFormat, BackupReader, BackupWriter};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zip::{
    CompressionMethod, ZipArchive, ZipWriter, result::ZipError, write::SimpleFileOptions,
    write::StreamWriter,
};

const FORMAT: &str = "recipe-box-export";
const VERSION: u32 = 1;
const MANIFEST: &str = "recipes.json";
const MEDIA_DIR: &str = "media/";

/// The zip implementation of the backup port.
pub struct ZipBackup;

#[async_trait]
impl BackupFormat for ZipBackup {
    fn writer(&self) -> Box<dyn BackupWriter> {
        Box::new(ZipExport::new())
    }

    async fn open(
        &self,
        path: PathBuf,
        limits: BackupLimits,
    ) -> DomainResult<Box<dyn BackupReader>> {
        let reader = tokio::task::spawn_blocking(move || ZipImport::open(path, limits))
            .await
            .map_err(DomainError::internal)??;
        Ok(Box::new(reader))
    }
}

// ---- the JSON shape ----------------------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format: String,
    version: u32,
    exported_at: Option<DateTime<Utc>>,
    recipes: Vec<Entry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    id: Uuid,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    ingredients: Vec<Line>,
    #[serde(default)]
    steps: Vec<Line>,
    #[serde(default)]
    servings: Option<String>,
    #[serde(default)]
    prep_minutes: Option<i32>,
    #[serde(default)]
    cook_minutes: Option<i32>,
    #[serde(default)]
    total_minutes: Option<i32>,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    source_name: Option<String>,
    #[serde(default)]
    source_type: Kind,
    #[serde(default)]
    image_id: Option<Uuid>,
    #[serde(default)]
    photo_image_ids: Vec<Uuid>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct Line {
    text: String,
    #[serde(default)]
    section: Option<String>,
}

#[derive(Serialize, Deserialize, Default, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Kind {
    #[default]
    Manual,
    Link,
    Photo,
    Text,
}

impl From<Kind> for SourceType {
    fn from(k: Kind) -> Self {
        match k {
            Kind::Manual => Self::Manual,
            Kind::Link => Self::Link,
            Kind::Photo => Self::Photo,
            Kind::Text => Self::Text,
        }
    }
}

impl From<SourceType> for Kind {
    fn from(k: SourceType) -> Self {
        match k {
            SourceType::Manual => Self::Manual,
            SourceType::Link => Self::Link,
            SourceType::Photo => Self::Photo,
            SourceType::Text => Self::Text,
        }
    }
}

fn lines(v: Vec<Line>) -> Vec<Ingredient> {
    v.into_iter()
        .map(|l| Ingredient {
            text: l.text,
            section: l.section,
        })
        .collect()
}

fn out_lines(v: &[Ingredient]) -> Vec<Line> {
    v.iter()
        .map(|l| Line {
            text: l.text.clone(),
            section: l.section.clone(),
        })
        .collect()
}

fn entry(r: &BackupRecipe) -> Entry {
    let i = &r.input;
    Entry {
        id: r.id,
        title: i.title.clone(),
        description: i.description.clone(),
        ingredients: out_lines(&i.ingredients),
        steps: out_lines(&i.steps),
        servings: i.servings.clone(),
        prep_minutes: i.prep_minutes,
        cook_minutes: i.cook_minutes,
        total_minutes: i.total_minutes,
        notes: i.notes.clone(),
        source_url: i.source_url.clone(),
        source_name: i.source_name.clone(),
        source_type: i.source_type.into(),
        image_id: i.image_id,
        photo_image_ids: i.photo_image_ids.clone(),
        tags: i.tags.clone(),
    }
}

fn recipe(e: Entry) -> BackupRecipe {
    BackupRecipe {
        id: e.id,
        input: RecipeInput {
            title: e.title,
            description: e.description,
            ingredients: lines(e.ingredients),
            steps: lines(e.steps),
            servings: e.servings,
            prep_minutes: e.prep_minutes,
            cook_minutes: e.cook_minutes,
            total_minutes: e.total_minutes,
            notes: e.notes,
            source_url: e.source_url,
            source_name: e.source_name,
            source_type: e.source_type.into(),
            image_id: e.image_id,
            photo_image_ids: e.photo_image_ids,
            tags: e.tags,
        },
    }
}

// ---- writing -----------------------------------------------------------------------------------------------

/// What the zip writer wrote since the last drain.
#[derive(Clone, Default)]
struct Pending(Arc<Mutex<Vec<u8>>>);

impl Write for Pending {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0
            .lock()
            .map_err(|_| io::Error::other("poisoned"))?
            .extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Pending {
    fn drain(&self) -> Vec<u8> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

struct ZipExport {
    zip: Option<ZipWriter<StreamWriter<Pending>>>,
    pending: Pending,
}

impl ZipExport {
    fn new() -> Self {
        let pending = Pending::default();
        Self {
            zip: Some(ZipWriter::new_stream(pending.clone())),
            pending,
        }
    }

    fn zip(&mut self) -> DomainResult<&mut ZipWriter<StreamWriter<Pending>>> {
        self.zip
            .as_mut()
            .ok_or_else(|| DomainError::Internal("the archive is already finished".into()))
    }
}

fn write_err(e: impl std::error::Error) -> DomainError {
    DomainError::internal(e)
}

impl BackupWriter for ZipExport {
    fn photo(&mut self, image_id: Uuid, jpeg: &[u8]) -> DomainResult<Vec<u8>> {
        let zip = self.zip()?;
        // A JPEG does not shrink, so it is stored as is.
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(format!("{MEDIA_DIR}{image_id}.jpg"), options)
            .map_err(write_err)?;
        zip.write_all(jpeg).map_err(write_err)?;
        Ok(self.pending.drain())
    }

    fn finish(
        &mut self,
        exported_at: DateTime<Utc>,
        recipes: &[BackupRecipe],
    ) -> DomainResult<Vec<u8>> {
        let manifest = Manifest {
            format: FORMAT.into(),
            version: VERSION,
            exported_at: Some(exported_at),
            recipes: recipes.iter().map(entry).collect(),
        };
        let zip = self.zip()?;
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file(MANIFEST, options).map_err(write_err)?;
        serde_json::to_writer(&mut *zip, &manifest).map_err(write_err)?;
        self.zip
            .take()
            .map(ZipWriter::finish)
            .transpose()
            .map_err(write_err)?;
        Ok(self.pending.drain())
    }
}

// ---- reading -----------------------------------------------------------------------------------------------

struct ZipImport {
    archive: Arc<Mutex<ZipArchive<File>>>,
    manifest: usize,
    photos: HashMap<Uuid, usize>,
    limits: BackupLimits,
}

fn bad(why: &str) -> DomainError {
    DomainError::validation(format!("That file is not a Recipe Box export: {why}."))
}

/// `media/<canonical lower-case uuid>.jpg` gives the uuid.
fn photo_id(name: &str) -> Option<Uuid> {
    let id = Uuid::try_parse(name.strip_prefix(MEDIA_DIR)?.strip_suffix(".jpg")?).ok()?;
    (name == format!("{MEDIA_DIR}{id}.jpg")).then_some(id)
}

impl ZipImport {
    fn open(path: PathBuf, limits: BackupLimits) -> DomainResult<Self> {
        let file = File::open(path).map_err(DomainError::internal)?;
        let mut archive = ZipArchive::new(file).map_err(|e| match e {
            ZipError::Io(io) => DomainError::internal(io),
            _ => bad("it is not a readable zip file"),
        })?;
        if archive.len() > limits.max_entries {
            return Err(bad("it holds too many files"));
        }
        if archive.has_duplicate_names() {
            return Err(bad("it lists a file twice"));
        }
        let (mut manifest, mut photos, mut total) = (None, HashMap::new(), 0u64);
        for i in 0..archive.len() {
            let f = archive
                .by_index_raw(i)
                .map_err(|_| bad("an entry is unreadable"))?;
            let name =
                std::str::from_utf8(f.name_raw()).map_err(|_| bad("a file name is not text"))?;
            if f.encrypted() {
                return Err(bad("it is encrypted"));
            }
            if !matches!(
                f.compression(),
                CompressionMethod::Stored | CompressionMethod::Deflated
            ) {
                return Err(bad("it uses an unsupported compression"));
            }
            let cap = if name == MANIFEST {
                limits.max_manifest_bytes
            } else if name == MEDIA_DIR && f.is_dir() {
                continue;
            } else if photo_id(name).is_some() {
                limits.max_photo_bytes
            } else {
                // Anything else, including every name that is absolute, has `..` in it or leaves the folders above.
                return Err(bad("it holds a file that does not belong in an export"));
            };
            if f.size() > cap {
                return Err(bad("a file in it is too large"));
            }
            total = total.saturating_add(f.size());
            if total > limits.max_total_bytes {
                return Err(bad("it expands to too much data"));
            }
            match photo_id(name) {
                Some(id) => {
                    photos.insert(id, i);
                }
                None => manifest = Some(i),
            }
        }
        let manifest = manifest.ok_or_else(|| bad("recipes.json is missing"))?;
        // Entries that share bytes could expand an archive far beyond its size.
        match archive.has_overlapping_entries() {
            Ok(false) => {}
            Ok(true) => return Err(bad("its files overlap")),
            Err(_) => return Err(bad("it is damaged")),
        }
        Ok(Self {
            archive: Arc::new(Mutex::new(archive)),
            manifest,
            photos,
            limits,
        })
    }
}

/// Reads entry `index` fully, giving up past `cap` bytes whatever the entry claimed about its size.
fn read_entry(archive: &Mutex<ZipArchive<File>>, index: usize, cap: u64) -> DomainResult<Vec<u8>> {
    let mut archive = archive.lock().unwrap_or_else(|e| e.into_inner());
    let f = archive
        .by_index(index)
        .map_err(|_| bad("a file in it is damaged"))?;
    let declared = f.size();
    let mut out = Vec::with_capacity(declared.min(cap) as usize);
    f.take(cap + 1)
        .read_to_end(&mut out)
        .map_err(|_| bad("a file in it is damaged"))?;
    if out.len() as u64 > cap || out.len() as u64 != declared {
        return Err(bad("a file in it is larger than it says"));
    }
    Ok(out)
}

#[async_trait]
impl BackupReader for ZipImport {
    async fn recipes(&self) -> DomainResult<Vec<BackupRecipe>> {
        let (archive, index, cap) = (
            self.archive.clone(),
            self.manifest,
            self.limits.max_manifest_bytes,
        );
        let bytes = tokio::task::spawn_blocking(move || read_entry(&archive, index, cap))
            .await
            .map_err(DomainError::internal)??;
        let manifest: Manifest =
            serde_json::from_slice(&bytes).map_err(|_| bad("recipes.json is not valid"))?;
        if manifest.format != FORMAT {
            return Err(bad("recipes.json is not from Recipe Box"));
        }
        if manifest.version > VERSION {
            return Err(DomainError::validation(
                "That export was made by a newer version of Recipe Box. Update this one first.",
            ));
        }
        if manifest.version == 0 {
            return Err(bad("recipes.json has no version"));
        }
        if manifest.recipes.len() > self.limits.max_recipes {
            return Err(bad("it holds too many recipes"));
        }
        let recipes: Vec<BackupRecipe> = manifest.recipes.into_iter().map(recipe).collect();
        for r in &recipes {
            let refs = r.input.image_id.iter().chain(&r.input.photo_image_ids);
            if refs.into_iter().any(|id| !self.photos.contains_key(id)) {
                return Err(bad("a recipe refers to a photo that is not in it"));
            }
        }
        Ok(recipes)
    }

    async fn photo(&self, image_id: Uuid) -> DomainResult<Option<Vec<u8>>> {
        let Some(&index) = self.photos.get(&image_id) else {
            return Ok(None);
        };
        let (archive, cap) = (self.archive.clone(), self.limits.max_photo_bytes);
        tokio::task::spawn_blocking(move || read_entry(&archive, index, cap))
            .await
            .map_err(DomainError::internal)?
            .map(Some)
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn limits() -> BackupLimits {
        BackupLimits {
            max_recipes: 2,
            max_entries: 5,
            max_total_bytes: 3000,
            max_manifest_bytes: 1000,
            max_photo_bytes: 1000,
        }
    }

    fn zip(entries: &[(String, Vec<u8>)]) -> tempfile::NamedTempFile {
        let mut z = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            let o = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            z.start_file(name, o).unwrap();
            z.write_all(data).unwrap();
        }
        let bytes = z.finish().unwrap().into_inner();
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(&bytes).unwrap();
        f
    }

    fn manifest(n: usize) -> (String, Vec<u8>) {
        let recipes: Vec<_> = (0..n)
            .map(|i| serde_json::json!({"id": Uuid::new_v4(), "title": format!("r{i}")}))
            .collect();
        (
            MANIFEST.into(),
            serde_json::json!({"format": FORMAT, "version": 1, "recipes": recipes})
                .to_string()
                .into_bytes(),
        )
    }

    fn photo(id: Uuid, len: usize) -> (String, Vec<u8>) {
        (format!("{MEDIA_DIR}{id}.jpg"), vec![0; len])
    }

    fn open(f: &tempfile::NamedTempFile) -> DomainResult<ZipImport> {
        ZipImport::open(f.path().to_path_buf(), limits())
    }

    fn refused(r: DomainResult<ZipImport>) -> String {
        match r {
            Err(DomainError::Validation(m)) => m,
            Err(e) => panic!("{e}"),
            Ok(_) => panic!("opened"),
        }
    }

    #[test]
    fn photo_names_are_canonical_uuids_under_media() {
        let id = Uuid::new_v4();
        assert_eq!(photo_id(&format!("media/{id}.jpg")), Some(id));
        for bad in [
            format!("media/{}.jpg", id.to_string().to_uppercase()),
            format!("media/{}.jpg", id.simple()),
            format!("/media/{id}.jpg"),
            format!("media/../media/{id}.jpg"),
            format!("media/sub/{id}.jpg"),
            format!("media/{id}.png"),
            format!("{id}.jpg"),
        ] {
            assert_eq!(photo_id(&bad), None, "{bad}");
        }
    }

    #[test]
    fn limits_on_entries_and_sizes_are_enforced_before_any_data_is_read() {
        let id = Uuid::new_v4();
        assert!(open(&zip(&[manifest(1), photo(id, 900)])).is_ok());
        // Declared size over the per-photo cap, though it deflates to a few bytes.
        assert!(refused(open(&zip(&[manifest(1), photo(id, 1_000_000)]))).contains("too large"));
        // Over the total.
        let three: Vec<_> = (0..3).map(|_| photo(Uuid::new_v4(), 1000)).collect();
        let mut all = vec![manifest(1)];
        all.extend(three);
        assert!(refused(open(&zip(&all))).contains("too much data"));
        // Too many entries.
        let many: Vec<_> = (0..6).map(|_| photo(Uuid::new_v4(), 1)).collect();
        assert!(refused(open(&zip(&many))).contains("too many files"));
        // Missing manifest.
        assert!(refused(open(&zip(&[photo(id, 1)]))).contains("recipes.json"));
    }

    #[test]
    fn hostile_names_duplicates_and_strangers_are_refused() {
        for name in [
            "../x.jpg",
            "/abs.jpg",
            "media/../x.jpg",
            "a/b",
            "media/x.jpg",
            "recipes.json ",
        ] {
            let r = open(&zip(&[manifest(0), (name.into(), b"x".to_vec())]));
            assert!(refused(r).contains("does not belong"), "{name}");
        }
    }

    #[tokio::test]
    async fn manifest_checks_count_version_and_photo_references() {
        use ports::BackupReader;
        let id = Uuid::new_v4();
        let ok = open(&zip(&[manifest(2), photo(id, 10)])).unwrap();
        assert_eq!(ok.recipes().await.unwrap().len(), 2);
        assert_eq!(ok.photo(id).await.unwrap().unwrap().len(), 10);
        assert!(ok.photo(Uuid::new_v4()).await.unwrap().is_none());
        // Three recipes is over max_recipes (2).
        let three = open(&zip(&[manifest(3)])).unwrap();
        assert!(three.recipes().await.is_err());
        let newer = (
            MANIFEST.to_string(),
            br#"{"format":"recipe-box-export","version":2,"recipes":[]}"#.to_vec(),
        );
        let r = open(&zip(&[newer])).unwrap().recipes().await.unwrap_err();
        assert!(r.to_string().contains("newer version"));
    }

    #[tokio::test]
    async fn writer_output_reads_back() {
        use ports::BackupReader;
        let mut w = ZipExport::new();
        let id = Uuid::new_v4();
        let mut bytes = w.photo(id, b"jpegbytes").unwrap();
        let recipe = BackupRecipe {
            id: Uuid::new_v4(),
            input: RecipeInput {
                title: "Soup".into(),
                image_id: Some(id),
                photo_image_ids: vec![id],
                ..Default::default()
            },
        };
        bytes.extend(w.finish(chrono::Utc::now(), &[recipe]).unwrap());
        assert!(w.finish(chrono::Utc::now(), &[]).is_err(), "finished once");
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(&bytes).unwrap();
        let r = ZipImport::open(f.path().to_path_buf(), BackupLimits::new(1 << 20)).unwrap();
        let recipes = r.recipes().await.unwrap();
        assert_eq!(recipes[0].input.title, "Soup");
        assert_eq!(recipes[0].input.photo_image_ids, vec![id]);
        assert_eq!(r.photo(id).await.unwrap().unwrap(), b"jpegbytes");
    }
}
