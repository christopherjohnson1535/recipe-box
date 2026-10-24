//! Household members (ACC-2): admin list/add/remove, password change for self or (admin) others.

use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::{
        AdminUser, CurrentUser, password,
        session::{self, COOKIE_NAME},
    },
    error::{AppError, AppJson, AppPath, AppResult, ErrorBody},
    models::{User, role_schema},
    state::AppState,
    validate,
};

/// All users, ordered by display name. Admin only.
#[utoipa::path(get, path = "/api/users", operation_id = "listUsers", tag = "users", security(("session" = [])), responses(
    (status = 200, description = "Users.", body = Vec<User>),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
))]
pub async fn list(State(state): State<AppState>, _admin: AdminUser) -> AppResult<Json<Vec<User>>> {
    let users = state.users.list().await?;
    Ok(Json(users.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserBody {
    username: String,
    display_name: String,
    password: String,
    #[schema(schema_with = role_schema)]
    role: String,
}

/// Adds a household member. Admin only.
#[utoipa::path(post, path = "/api/users", operation_id = "createUser", tag = "users", security(("session" = [])), request_body = CreateUserBody, responses(
    (status = 201, description = "User created.", body = User),
    (status = 400, description = "Invalid field (`validation`).", body = ErrorBody),
    (status = 403, description = "Not an admin (`forbidden`).", body = ErrorBody),
    (status = 409, description = "Username taken (`conflict`).", body = ErrorBody),
))]
pub async fn create(
    State(state): State<AppState>,
    _admin: AdminUser,
    AppJson(body): AppJson<CreateUserBody>,
) -> AppResult<(StatusCode, Json<User>)> {
    let username = validate::username(&body.username)?;
    let display_name = validate::display_name(&body.display_name)?;
    validate::password(&body.password)?;
    if !matches!(body.role.as_str(), "admin" | "member") {
        return Err(AppError::validation("role: `admin` or `member`."));
    }
    let hash = password::hash(body.password).await?;
    let user = state
        .users
        .create(domain::NewUser {
            username,
            display_name,
            password_hash: hash,
            role: body.role,
        })
        .await?;
    Ok((StatusCode::CREATED, Json(user.into())))
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
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    if id == admin.id {
        return Err(AppError::Forbidden("You can't remove yourself.".into()));
    }
    state.users.remove(id).await?;
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
))]
pub async fn set_password(
    State(state): State<AppState>,
    CurrentUser(caller): CurrentUser,
    jar: CookieJar,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<SetPasswordBody>,
) -> AppResult<StatusCode> {
    let own = id == caller.id;
    if !own && !caller.is_admin() {
        return Err(AppError::Forbidden("Only an admin can do that.".into()));
    }
    validate::password(&body.password)?;

    let Some(current) = state.users.password_hash(id).await? else {
        return Err(AppError::NotFound("No such user.".into()));
    };
    if own {
        let given = body.current_password.unwrap_or_default();
        if given.chars().count() > validate::MAX_PASSWORD {
            return Err(AppError::Unauthenticated("Wrong username or password."));
        }
        if !password::verify(given, Some(current.clone())).await? {
            return Err(AppError::Unauthenticated("Wrong username or password."));
        }
    }
    let hash = password::hash(body.password).await?;
    let keep = own
        .then(|| jar.get(COOKIE_NAME).map(|c| session::hash_token(c.value())))
        .flatten();
    // The hash the caller verified against must still be the stored one; an admin reset checks nothing.
    state
        .users
        .set_password_hash(id, &hash, own.then_some(current.as_str()), keep.as_deref())
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
