//! Household members (ACC-2). 501 stubs until the users issue lands; auth checks are already in place.

use super::not_implemented;
use crate::{
    auth::{AdminUser, CurrentUser},
    error::AppError,
};

/// `GET /api/users` → `User[]`.
pub async fn list(_admin: AdminUser) -> AppError {
    not_implemented("Listing users")
}

/// `POST /api/users` `{ username, displayName, password, role }` → `201 User`.
pub async fn create(_admin: AdminUser) -> AppError {
    not_implemented("Adding users")
}

/// `DELETE /api/users/:id` → `204` (not yourself, not the last admin).
pub async fn remove(_admin: AdminUser) -> AppError {
    not_implemented("Removing users")
}

/// `PUT /api/users/:id/password` `{ password }` → `204` (admin, or the user themself — check in the handler).
pub async fn set_password(_user: CurrentUser) -> AppError {
    not_implemented("Changing passwords")
}
