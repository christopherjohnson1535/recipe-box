//! Backup export / import (ACC-5). 501 stubs until the export issue lands.

use serde::Serialize;
use utoipa::ToSchema;

use super::not_implemented;
use crate::models::BinaryFile;
use crate::{
    auth::AdminUser,
    error::{AppError, ErrorBody},
};

/// Result of importing a backup zip.
#[derive(Serialize, ToSchema)]
pub struct ImportSummary {
    imported: i64,
    skipped: i64,
}

/// Multipart body of `POST /api/import/export`.
#[derive(ToSchema)]
#[allow(dead_code)] // schema only; the handler reads the multipart stream itself
pub struct ImportExportForm {
    /// The zip made by `GET /api/export`.
    #[schema(value_type = String, format = Binary)]
    file: Vec<u8>,
}

/// Backup zip with `recipes.json` and `media/*`. Admin only.
#[utoipa::path(get, path = "/api/export", operation_id = "exportAll", tag = "export", security(("session" = [])), responses(
    (status = 200, description = "The backup zip.", content_type = "application/zip",
        body = BinaryFile),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 501, description = "Not built yet (`not_implemented`); every call returns this today.", body = ErrorBody),
))]
pub async fn export_zip(_admin: AdminUser) -> AppError {
    not_implemented("Export")
}

/// Restores a backup zip, skipping recipes whose id exists. Admin only.
#[utoipa::path(post, path = "/api/import/export", operation_id = "importExport", tag = "export", security(("session" = [])),
    request_body(content = ImportExportForm, content_type = "multipart/form-data"), responses(
    (status = 200, description = "Counts of imported and skipped recipes.", body = ImportSummary),
    (status = 400, description = "Missing or unreadable `file` (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 413, description = "Upload over `MAX_UPLOAD_MB` (`too_large`).", body = ErrorBody),
    (status = 501, description = "Not built yet (`not_implemented`); every call returns this today.", body = ErrorBody),
))]
pub async fn import_zip(_admin: AdminUser) -> AppError {
    not_implemented("Importing an export")
}
