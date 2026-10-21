//! Backup export / import (ACC-5). 501 stubs until the export issue lands.

use super::not_implemented;
use crate::{auth::AdminUser, error::AppError};

/// `GET /api/export` → `application/zip` with `recipes.json` + `media/*`.
pub async fn export_zip(_admin: AdminUser) -> AppError {
    not_implemented("Export")
}

/// `POST /api/import/export` multipart `file` → `{ imported, skipped }`.
pub async fn import_zip(_admin: AdminUser) -> AppError {
    not_implemented("Importing an export")
}
