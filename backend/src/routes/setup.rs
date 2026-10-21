use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    auth::{password, session},
    error::{AppError, AppJson, AppResult},
    models::User,
    state::AppState,
    user_columns, validate,
};

pub async fn status(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let has_users: bool = sqlx::query_scalar("select exists (select 1 from users)")
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(json!({ "needsSetup": !has_users })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupBody {
    username: String,
    display_name: String,
    password: String,
}

/// Creates the first admin and signs them in. Only allowed while there are no users.
pub async fn create_admin(
    State(state): State<AppState>,
    jar: CookieJar,
    AppJson(body): AppJson<SetupBody>,
) -> AppResult<(StatusCode, CookieJar, Json<User>)> {
    let username = validate::username(&body.username)?;
    let display_name = validate::display_name(&body.display_name)?;
    validate::password(&body.password)?;
    let hash = password::hash(body.password).await?;

    let mut tx = state.pool.begin().await?;
    // Serialises concurrent setup attempts so only one admin is created.
    sqlx::query("lock table users in share row exclusive mode")
        .execute(&mut *tx)
        .await?;
    let has_users: bool = sqlx::query_scalar("select exists (select 1 from users)")
        .fetch_one(&mut *tx)
        .await?;
    if has_users {
        return Err(AppError::Forbidden("Setup is already done.".into()));
    }
    let user = sqlx::query_as::<_, User>(concat!(
        "insert into users (username, display_name, password_hash, role) values ($1, $2, $3, 'admin') returning ",
        user_columns!()
    ))
    .bind(&username)
    .bind(&display_name)
    .bind(&hash)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;

    let jar = session::start(&state.pool, &state.config, jar, user.id).await?;
    Ok((StatusCode::CREATED, jar, Json(user)))
}
