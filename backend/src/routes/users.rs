//! Household members (ACC-2): admin list/add/remove, password change for self or (admin) others.

use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::{
        AdminUser, CurrentUser, password,
        session::{self, COOKIE_NAME},
    },
    error::{AppError, AppJson, AppPath, AppResult},
    models::User,
    state::AppState,
    user_columns, validate,
};

/// `GET /api/users` → `User[]`, ordered by display name.
pub async fn list(State(state): State<AppState>, _admin: AdminUser) -> AppResult<Json<Vec<User>>> {
    let users = sqlx::query_as::<_, User>(concat!(
        "select ",
        user_columns!(),
        " from users order by lower(display_name), username"
    ))
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(users))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBody {
    username: String,
    display_name: String,
    password: String,
    role: String,
}

/// `POST /api/users` `{ username, displayName, password, role }` → `201 User`.
pub async fn create(
    State(state): State<AppState>,
    _admin: AdminUser,
    AppJson(body): AppJson<CreateBody>,
) -> AppResult<(StatusCode, Json<User>)> {
    let username = validate::username(&body.username)?;
    let display_name = validate::display_name(&body.display_name)?;
    validate::password(&body.password)?;
    if !matches!(body.role.as_str(), "admin" | "member") {
        return Err(AppError::validation("role: `admin` or `member`."));
    }
    let hash = password::hash(body.password).await?;
    let user = sqlx::query_as::<_, User>(concat!(
        "insert into users (username, display_name, password_hash, role) values ($1, $2, $3, $4) returning ",
        user_columns!()
    ))
    .bind(&username)
    .bind(&display_name)
    .bind(&hash)
    .bind(&body.role)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(d) if d.is_unique_violation() => {
            AppError::Conflict("That username is already taken.".into())
        }
        _ => e.into(),
    })?;
    Ok((StatusCode::CREATED, Json(user)))
}

/// `DELETE /api/users/:id` → `204`. Not yourself, not the last admin.
/// Their sessions go with them (FK cascade); recipes stay, with `created_by`/`updated_by` set to null (FK `set null`).
pub async fn remove(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    if id == admin.id {
        return Err(AppError::Forbidden("You can't remove yourself.".into()));
    }
    let mut tx = state.pool.begin().await?;
    // Locks every admin row plus the target, so concurrent deletes can't both pass the last-admin check.
    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "select id, role from users where role = 'admin' or id = $1 order by id for update",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let Some((_, role)) = rows.iter().find(|(rid, _)| *rid == id) else {
        return Err(AppError::NotFound("No such user.".into()));
    };
    let admins = rows.iter().filter(|(_, r)| r == "admin").count();
    if role == "admin" && admins <= 1 {
        return Err(AppError::Forbidden(
            "You can't remove the last admin.".into(),
        ));
    }
    sqlx::query("delete from users where id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordBody {
    password: String,
    current_password: Option<String>,
}

/// `PUT /api/users/:id/password` `{ password, currentPassword? }` → `204`.
/// Own password: `currentPassword` required. Admin resetting another user's: not needed. Ends the user's other sessions.
pub async fn set_password(
    State(state): State<AppState>,
    CurrentUser(caller): CurrentUser,
    jar: CookieJar,
    AppPath(id): AppPath<Uuid>,
    AppJson(body): AppJson<PasswordBody>,
) -> AppResult<StatusCode> {
    let own = id == caller.id;
    if !own && !caller.is_admin() {
        return Err(AppError::Forbidden("Only an admin can do that.".into()));
    }
    validate::password(&body.password)?;

    let mut tx = state.pool.begin().await?;
    let current: Option<String> =
        sqlx::query_scalar("select password_hash from users where id = $1 for update")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(current) = current else {
        return Err(AppError::NotFound("No such user.".into()));
    };
    if own {
        let given = body.current_password.unwrap_or_default();
        if given.chars().count() > validate::MAX_PASSWORD {
            return Err(AppError::Unauthenticated("Wrong username or password."));
        }
        if !password::verify(given, Some(current)).await? {
            return Err(AppError::Unauthenticated("Wrong username or password."));
        }
    }
    let hash = password::hash(body.password).await?;
    sqlx::query("update users set password_hash = $2 where id = $1")
        .bind(id)
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    let keep = own
        .then(|| jar.get(COOKIE_NAME).map(|c| session::hash_token(c.value())))
        .flatten();
    session::end_for_user(&mut tx, id, keep).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
