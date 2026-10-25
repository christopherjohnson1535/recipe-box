//! Backup export / import (ACC-5). Thin: the workflow is `app::ExportService`, the zip format an adapter behind a
//! port. This reads the upload to a temporary file (never into memory) and streams the download.

use app::ExportJob;
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{Multipart, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use utoipa::ToSchema;

use super::media::log_rendition;
use crate::{
    HttpState,
    dto::BinaryFile,
    error::{AppError, AppResult, ErrorBody},
    extract::AdminUser,
};

/// Result of importing a backup zip.
#[derive(Serialize, ToSchema)]
pub struct ImportSummary {
    /// Recipes added.
    imported: usize,
    /// Recipes left out because a recipe with their id already exists.
    skipped: usize,
}

/// Multipart body of `POST /api/import/export`.
#[derive(ToSchema)]
#[allow(dead_code)] // schema only; the handler reads the multipart stream itself
pub struct ImportExportForm {
    /// The zip made by `GET /api/export`.
    #[schema(value_type = String, format = Binary)]
    file: Vec<u8>,
}

/// Backup zip of every recipe and photo. Admin only.
///
/// `recipes.json` and `media/*`; the format is in docs/API.md. Streamed: the answer starts before the zip is complete,
/// and a failure part-way ends the connection early.
#[utoipa::path(get, path = "/api/export", operation_id = "exportAll", tag = "export", security(("session" = [])), responses(
    (status = 200, description = "The backup zip, as an attachment.", content_type = "application/zip",
        body = BinaryFile),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
))]
pub async fn export_zip(State(state): State<HttpState>, _admin: AdminUser) -> AppResult<Response> {
    let job = state.services.export.export().await?;
    let file_name = format!(
        "recipe-box-export-{}.zip",
        job.exported_at().format("%Y-%m-%d")
    );
    let stream = futures_util::stream::unfold(Some(job), |job| async move {
        let mut job: ExportJob = job?;
        match job.next_chunk().await {
            Ok(Some(chunk)) => Some((Ok(Bytes::from(chunk)), Some(job))),
            Ok(None) => {
                if !job.missing_photos().is_empty() {
                    tracing::warn!(photos = ?job.missing_photos(), "export: photo files are missing and were left out");
                }
                None
            }
            Err(e) => {
                tracing::error!(error = %e, "export failed part-way; the download is cut short");
                Some((Err(std::io::Error::other("export failed")), None))
            }
        }
    });
    let mut res = Body::from_stream(stream).into_response();
    let h = res.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{file_name}\"")) {
        h.insert(header::CONTENT_DISPOSITION, v);
    }
    Ok(res)
}

/// Restores a backup zip. Admin only.
///
/// A recipe whose id already exists is skipped; every other recipe is added with a new id, owned by the caller, and
/// its photos are checked and re-encoded like uploads. All or nothing: if anything in the archive is wrong, nothing
/// is added.
#[utoipa::path(post, path = "/api/import/export", operation_id = "importExport", tag = "export", security(("session" = [])),
    request_body(content = ImportExportForm, content_type = "multipart/form-data"), responses(
    (status = 200, description = "Counts of imported and skipped recipes.", body = ImportSummary),
    (status = 400, description = "Missing `file`, or not a valid export: not a zip, unknown or oversized entries, bad JSON, a newer format version, a recipe that fails the usual recipe rules (`validation`). Nothing is imported.", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 413, description = "Upload over `MAX_BACKUP_MB` (`too_large`).", body = ErrorBody),
    (status = 415, description = "A photo in the archive is not an image we can read (`unsupported_media`). Nothing is imported.", body = ErrorBody),
))]
pub async fn import_zip(
    State(state): State<HttpState>,
    AdminUser(admin): AdminUser,
    mut multipart: Multipart,
) -> AppResult<Json<ImportSummary>> {
    let tmp = tempfile::NamedTempFile::new().map_err(|e| AppError::Internal(e.into()))?;
    let mut sink =
        tokio::fs::File::from_std(tmp.reopen().map_err(|e| AppError::Internal(e.into()))?);
    let mut found = false;
    while let Some(mut field) = multipart.next_field().await? {
        if field.name() != Some("file") {
            continue;
        }
        let mut written = 0usize;
        while let Some(chunk) = field.chunk().await? {
            written += chunk.len();
            if written > state.config.max_backup_bytes {
                return Err(AppError::TooLarge);
            }
            sink.write_all(&chunk)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
        }
        found = true;
        break;
    }
    if !found {
        return Err(AppError::validation("file: missing."));
    }
    sink.flush()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    drop(sink);
    // The import runs as its own task: a client that disconnects part-way must not leave half an import behind
    // (it either finishes or undoes itself). The temporary file lives as long as the task.
    let services = state.services.clone();
    let report = tokio::spawn(async move {
        services
            .export
            .import_backup(admin.id, tmp.path().to_path_buf())
            .await
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))??;
    for (id, e) in &report.rendition_errors {
        log_rendition(*id, e);
    }
    Ok(Json(ImportSummary {
        imported: report.imported,
        skipped: report.skipped,
    }))
}
