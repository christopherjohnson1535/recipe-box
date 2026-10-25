//! Household members (ACC-2): admin list/add/remove, password change for self or (admin) others.

use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Deserializer};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    HttpState,
    client_ip::ClientIp,
    dto::{User, role_schema},
    error::{AppJson, AppPath, AppResult, ErrorBody},
    extract::{AdminUser, CurrentUser, session_token},
};

/// All users, ordered by display name. Admin only.
#[utoipa::path(get, path = "/api/users", operation_id = "listUsers", tag = "users", security(("session" = [])), responses(
    (status = 200, description = "Users.", body = Vec<User>),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
))]
pub async fn list(State(state): State<HttpState>, _admin: AdminUser) -> AppResult<Json<Vec<User>>> {
    let users = state.services.users.list().await?;
    Ok(Json(users.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[schema(example = json!({"username": "alex", "displayName": "Alex", "password": "correct horse battery", "role": "member", "email": "alex@example.com"}))]
pub struct CreateUserBody {
    username: String,
    display_name: String,
    password: String,
    #[schema(schema_with = role_schema)]
    role: String,
    /// The Google address that may sign in as this member (optional; trimmed and lower-cased, blank means none).
    #[serde(default)]
    email: Option<String>,
}

/// Adds a household member. Admin only.
#[utoipa::path(post, path = "/api/users", operation_id = "createUser", tag = "users", security(("session" = [])), request_body = CreateUserBody, responses(
    (status = 201, description = "User created.", body = User),
    (status = 400, description = "Invalid field (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 409, description = "Username or email taken (`conflict`).", body = ErrorBody),
))]
pub async fn create(
    State(state): State<HttpState>,
    _admin: AdminUser,
    AppJson(body): AppJson<CreateUserBody>,
) -> AppResult<(StatusCode, Json<User>)> {
    let user = state
        .services
        .users
        .create(
            &body.username,
            &body.display_name,
            body.password,
            &body.role,
            body.email.as_deref(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(user.into())))
}

/// `email` must be present, as a string or `null` (a missing key is an error, not a clear).
fn email_field<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}

#[derive(Deserialize, ToSchema)]
#[schema(example = json!({"email": "alex@example.com"}))]
pub struct UpdateUserBody {
    /// The Google address that may sign in as this member; `null` or blank clears it.
    #[serde(deserialize_with = "email_field")]
    #[schema(required = true)]
    email: Option<String>,
}

/// Sets or clears a member's email, the address a Google account must have verified to sign in as them. Admin only.
/// Replacing or clearing an email that was set also deletes all of the member's linked Google accounts (they were
/// matched through the old address); setting a first email, or the same one again, keeps them.
#[utoipa::path(patch, path = "/api/users/{id}", operation_id = "updateUser", tag = "users", security(("session" = [])),
    params(("id" = Uuid, Path, description = "User id")), request_body = UpdateUserBody, responses(
    (status = 200, description = "The member now.", body = User),
    (status = 400, description = "Malformed email or id, or no `email` key (`validation`).", body = ErrorBody),
    (status = 401, description = "No or expired session (`unauthenticated`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 404, description = "No such user (`not_found`).", body = ErrorBody),
    (status = 409, description = "Another member has that email (`conflict`).", body = ErrorBody),
    (status = 413, description = "Body over the size limit (`too_large`).", body = ErrorBody),
    (status = 500, description = "Something went wrong on the server (`internal`).", body = ErrorBody),
))]
pub async fn update(
    State(state): State<HttpState>,
    _admin: AdminUser,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<UpdateUserBody>,
) -> AppResult<Json<User>> {
    let user = state
        .services
        .users
        .set_email(id, body.email.as_deref())
        .await?;
    Ok(Json(user.into()))
}

/// Removes a user. Not yourself, not the last admin.
///
/// Their sessions go with them (FK cascade); recipes stay, with `created_by`/`updated_by` set to null (FK `set null`).
#[utoipa::path(delete, path = "/api/users/{id}", operation_id = "deleteUser", tag = "users", security(("session" = [])),
    params(("id" = Uuid, Path, description = "User id")), responses(
    (status = 204, description = "User removed."),
    (status = 400, description = "Malformed id (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin, removing yourself, or removing the last admin (`forbidden`).", body = ErrorBody),
    (status = 404, description = "No such user (`not_found`).", body = ErrorBody),
))]
pub async fn remove(
    State(state): State<HttpState>,
    AdminUser(admin): AdminUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    state.services.users.remove(&admin, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetPasswordBody {
    password: String,
    current_password: Option<String>,
}

/// Changes a user's password.
///
/// Own password: `currentPassword` required. Admin resetting another user's: not needed. Ends the user's other sessions.
#[utoipa::path(put, path = "/api/users/{id}/password", operation_id = "setUserPassword", tag = "users", security(("session" = [])),
    params(("id" = Uuid, Path, description = "User id")), request_body = SetPasswordBody, responses(
    (status = 204, description = "Password changed; the user's other sessions ended."),
    (status = 400, description = "Invalid password or malformed id (`validation`).", body = ErrorBody),
    (status = 401, description = "Not signed in, or wrong `currentPassword` for your own account (`unauthenticated`).", body = ErrorBody),
    (status = 403, description = "A member changing someone else's password (`forbidden`).", body = ErrorBody),
    (status = 404, description = "No such user (`not_found`).", body = ErrorBody),
    (status = 429, description = "Too many wrong `currentPassword`s for this account or from this address (`rate_limited`). `Retry-After` is in seconds.", body = ErrorBody,
        headers(("Retry-After" = u64, description = "Seconds to wait."))),
))]
pub async fn set_password(
    State(state): State<HttpState>,
    CurrentUser(caller): CurrentUser,
    ClientIp(client): ClientIp,
    jar: CookieJar,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<SetPasswordBody>,
) -> AppResult<StatusCode> {
    state
        .services
        .users
        .set_password(
            &caller,
            id,
            body.password,
            body.current_password,
            session_token(&jar),
            client,
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
