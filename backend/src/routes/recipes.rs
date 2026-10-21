use axum::{Json, extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction, types::Json as SqlJson};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppJson, AppPath, AppQuery, AppResult},
    models::{
        Ingredient, Recipe, RecipeInput, RecipeSummary, SourceType, Step, UserRef, media_url,
    },
    state::AppState,
    validate,
};

const RESTORE_WINDOW_MINUTES: i32 = 10;

#[derive(Deserialize)]
#[serde(default)]
pub struct ListQuery {
    q: Option<String>,
    tag: Option<String>,
    sort: Option<String>,
    limit: i64,
    offset: i64,
}

impl Default for ListQuery {
    fn default() -> Self {
        Self {
            q: None,
            tag: None,
            sort: None,
            limit: 50,
            offset: 0,
        }
    }
}

#[derive(serde::Serialize)]
pub struct RecipePage {
    items: Vec<RecipeSummary>,
    total: i64,
}

const SUMMARY_SELECT: &str = "
    select r.id, r.title, r.description, r.total_minutes, r.source_type, r.updated_at,
           i.file_name as image_file,
           coalesce((select array_agg(t.name::text order by t.name)
                     from recipe_tags rt join tags t on t.id = rt.tag_id where rt.recipe_id = r.id), '{}') as tags
    from recipes r left join images i on i.id = r.image_id";

const LIST_WHERE: &str = "
    where r.deleted_at is null
      and ($1::citext is null or exists (select 1 from recipe_tags rt join tags t on t.id = rt.tag_id
                                         where rt.recipe_id = r.id and t.name = $1::citext))
      and ($2::text is null or strpos(lower(r.title), lower($2)) > 0)";

pub async fn list(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppQuery(q): AppQuery<ListQuery>,
) -> AppResult<Json<RecipePage>> {
    if !(1..=200).contains(&q.limit) {
        return Err(AppError::validation("limit: 1–200."));
    }
    if q.offset < 0 {
        return Err(AppError::validation("offset: must be 0 or more."));
    }
    let order = match q.sort.as_deref().unwrap_or("newest") {
        "newest" => "r.created_at desc, r.id",
        "title" => "lower(r.title), r.id",
        "time" => "r.total_minutes asc nulls last, lower(r.title), r.id",
        _ => return Err(AppError::validation("sort: newest, title or time.")),
    };
    let tag = q
        .tag
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty());
    // shortcut: plain title substring match until the search issue (FND-2) adds websearch_to_tsquery on `search`.
    let search = q.q.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    // `order` is one of the fixed strings above, never user input.
    let sql = format!("{SUMMARY_SELECT} {LIST_WHERE} order by {order} limit $3 offset $4");
    let mut items = sqlx::query_as::<_, RecipeSummary>(AssertSqlSafe(sql))
        .bind(&tag)
        .bind(&search)
        .bind(q.limit)
        .bind(q.offset)
        .fetch_all(&state.pool)
        .await?;
    for item in &mut items {
        item.image_url = item.image_file.as_deref().map(media_url);
    }
    let count_sql = format!("select count(*) from recipes r {LIST_WHERE}");
    let total: i64 = sqlx::query_scalar(AssertSqlSafe(count_sql))
        .bind(&tag)
        .bind(&search)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(RecipePage { items, total }))
}

pub async fn create(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(input): AppJson<RecipeInput>,
) -> AppResult<(StatusCode, Json<Recipe>)> {
    let input = validate::recipe(input)?;
    check_images(&state.pool, &input).await?;
    let mut tx = state.pool.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        "insert into recipes (title, created_by, updated_by) values ($1, $2, $2) returning id",
    )
    .bind(&input.title)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    save(&mut tx, id, user.id, &input).await?;
    tx.commit().await?;
    let recipe = load(&state.pool, id).await?.ok_or_else(not_found)?;
    Ok((StatusCode::CREATED, Json(recipe)))
}

pub async fn get(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<Json<Recipe>> {
    Ok(Json(load(&state.pool, id).await?.ok_or_else(not_found)?))
}

pub async fn update(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppPath(id): AppPath<Uuid>,
    AppJson(input): AppJson<RecipeInput>,
) -> AppResult<Json<Recipe>> {
    let input = validate::recipe(input)?;
    check_images(&state.pool, &input).await?;
    let mut tx = state.pool.begin().await?;
    let live: Option<Uuid> = sqlx::query_scalar(
        "select id from recipes where id = $1 and deleted_at is null for update",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    live.ok_or_else(not_found)?;
    save(&mut tx, id, user.id, &input).await?;
    tx.commit().await?;
    Ok(Json(load(&state.pool, id).await?.ok_or_else(not_found)?))
}

/// Soft delete; the row is purged a day later.
pub async fn remove(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<StatusCode> {
    let done =
        sqlx::query("update recipes set deleted_at = now() where id = $1 and deleted_at is null")
            .bind(id)
            .execute(&state.pool)
            .await?;
    if done.rows_affected() == 0 {
        return Err(not_found());
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore(
    State(state): State<AppState>,
    _user: CurrentUser,
    AppPath(id): AppPath<Uuid>,
) -> AppResult<Json<Recipe>> {
    let deleted_at: Option<Option<DateTime<Utc>>> =
        sqlx::query_scalar("select deleted_at from recipes where id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    match deleted_at {
        None => return Err(not_found()),
        Some(None) => {} // not deleted: restoring is a no-op
        Some(Some(_)) => {
            let done = sqlx::query(
                "update recipes set deleted_at = null
                 where id = $1 and deleted_at > now() - make_interval(mins => $2)",
            )
            .bind(id)
            .bind(RESTORE_WINDOW_MINUTES)
            .execute(&state.pool)
            .await?;
            if done.rows_affected() == 0 {
                return Err(AppError::Conflict(format!(
                    "This recipe was deleted more than {RESTORE_WINDOW_MINUTES} minutes ago and can no longer be restored."
                )));
            }
        }
    }
    Ok(Json(load(&state.pool, id).await?.ok_or_else(not_found)?))
}

fn not_found() -> AppError {
    AppError::NotFound("Recipe not found.".into())
}

/// Rejects unknown image ids up front so they are a 400, not a foreign-key 500.
async fn check_images(pool: &PgPool, input: &RecipeInput) -> AppResult<()> {
    let mut ids = input.photo_image_ids.clone();
    ids.extend(input.image_id);
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Ok(());
    }
    let found: i64 = sqlx::query_scalar("select count(*) from images where id = any($1)")
        .bind(&ids)
        .fetch_one(pool)
        .await?;
    if found as usize != ids.len() {
        return Err(AppError::validation(
            "imageId/photoImageIds: unknown image.",
        ));
    }
    Ok(())
}

/// Writes all fields, tags and photos of an existing row (full replace).
async fn save(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    user_id: Uuid,
    r: &RecipeInput,
) -> AppResult<()> {
    sqlx::query(
        "update recipes set title = $2, description = $3, ingredients = $4, steps = $5, servings = $6,
             prep_minutes = $7, cook_minutes = $8, total_minutes = $9, notes = $10, source_url = $11,
             source_name = $12, source_type = $13, image_id = $14, updated_by = $15, updated_at = now()
         where id = $1",
    )
    .bind(id)
    .bind(&r.title)
    .bind(&r.description)
    .bind(SqlJson(&r.ingredients))
    .bind(SqlJson(&r.steps))
    .bind(&r.servings)
    .bind(r.prep_minutes)
    .bind(r.cook_minutes)
    .bind(r.total_minutes)
    .bind(&r.notes)
    .bind(&r.source_url)
    .bind(&r.source_name)
    .bind(r.source_type)
    .bind(r.image_id)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    sqlx::query("delete from recipe_tags where recipe_id = $1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    if !r.tags.is_empty() {
        sqlx::query(
            "insert into tags (name) select unnest($1::text[]) on conflict (name) do nothing",
        )
        .bind(&r.tags)
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            "insert into recipe_tags (recipe_id, tag_id)
             select $1, id from tags where name = any($2::citext[])",
        )
        .bind(id)
        .bind(&r.tags)
        .execute(&mut **tx)
        .await?;
    }

    sqlx::query("delete from recipe_photos where recipe_id = $1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        "insert into recipe_photos (recipe_id, image_id, position)
         select $1, p.id, (p.ord - 1)::int from unnest($2::uuid[]) with ordinality as p(id, ord)",
    )
    .bind(id)
    .bind(&r.photo_image_ids)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct RecipeRow {
    id: Uuid,
    title: String,
    description: String,
    ingredients: SqlJson<Vec<Ingredient>>,
    steps: SqlJson<Vec<Step>>,
    servings: Option<String>,
    prep_minutes: Option<i32>,
    cook_minutes: Option<i32>,
    total_minutes: Option<i32>,
    notes: String,
    source_url: Option<String>,
    source_name: Option<String>,
    source_type: SourceType,
    image_id: Option<Uuid>,
    image_file: Option<String>,
    tags: Vec<String>,
    photo_image_ids: Vec<Uuid>,
    photo_files: Vec<String>,
    created_by: Option<Uuid>,
    created_by_name: Option<String>,
    updated_by: Option<Uuid>,
    updated_by_name: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

/// Loads a live (not deleted) recipe with tags, photos and user refs.
pub async fn load(pool: &PgPool, id: Uuid) -> AppResult<Option<Recipe>> {
    let row = sqlx::query_as::<_, RecipeRow>(
        "select r.id, r.title, r.description, r.ingredients, r.steps, r.servings, r.prep_minutes,
                r.cook_minutes, r.total_minutes, r.notes, r.source_url, r.source_name, r.source_type,
                r.image_id, i.file_name as image_file,
                coalesce((select array_agg(t.name::text order by t.name)
                          from recipe_tags rt join tags t on t.id = rt.tag_id where rt.recipe_id = r.id), '{}') as tags,
                coalesce((select array_agg(rp.image_id order by rp.position)
                          from recipe_photos rp where rp.recipe_id = r.id), '{}') as photo_image_ids,
                coalesce((select array_agg(pi.file_name order by rp.position)
                          from recipe_photos rp join images pi on pi.id = rp.image_id
                          where rp.recipe_id = r.id), '{}') as photo_files,
                r.created_by, cu.display_name as created_by_name,
                r.updated_by, uu.display_name as updated_by_name,
                r.created_at, r.updated_at
         from recipes r
         left join images i on i.id = r.image_id
         left join users cu on cu.id = r.created_by
         left join users uu on uu.id = r.updated_by
         where r.id = $1 and r.deleted_at is null",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| Recipe {
        id: r.id,
        title: r.title,
        description: r.description,
        ingredients: r.ingredients.0,
        steps: r.steps.0,
        servings: r.servings,
        prep_minutes: r.prep_minutes,
        cook_minutes: r.cook_minutes,
        total_minutes: r.total_minutes,
        notes: r.notes,
        source_url: r.source_url,
        source_name: r.source_name,
        source_type: r.source_type,
        image_id: r.image_id,
        photo_image_ids: r.photo_image_ids,
        tags: r.tags,
        image_url: r.image_file.as_deref().map(media_url),
        photo_urls: r.photo_files.iter().map(|f| media_url(f)).collect(),
        created_by: user_ref(r.created_by, r.created_by_name),
        updated_by: user_ref(r.updated_by, r.updated_by_name),
        created_at: r.created_at,
        updated_at: r.updated_at,
    }))
}

fn user_ref(id: Option<Uuid>, name: Option<String>) -> Option<UserRef> {
    Some(UserRef {
        id: id?,
        display_name: name?,
    })
}
