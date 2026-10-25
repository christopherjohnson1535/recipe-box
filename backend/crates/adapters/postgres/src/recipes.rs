use std::sync::Arc;

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Ingredient, Page, RESTORE_WINDOW_MINUTES, Recipe, RecipeInput,
    RecipeSummary, SearchQuery, Sort, SourceType, UserRef,
    chrono::{DateTime, Duration, Utc},
    uuid::Uuid,
};
use ports::{Clock, RecipeRepo};
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction, types::Json};

use crate::error::{db, violation};

pub struct PgRecipeRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgRecipeRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

/// An ingredient or step as stored in the `jsonb` columns (`{"text", "section"}`).
#[derive(Serialize, Deserialize)]
pub(crate) struct Line {
    text: String,
    #[serde(default)]
    section: Option<String>,
}

impl From<&Ingredient> for Line {
    fn from(i: &Ingredient) -> Self {
        Self {
            text: i.text.clone(),
            section: i.section.clone(),
        }
    }
}

impl From<Line> for Ingredient {
    fn from(l: Line) -> Self {
        Self {
            text: l.text,
            section: l.section,
        }
    }
}

fn source_type(s: &str) -> SourceType {
    match s {
        "link" => SourceType::Link,
        "photo" => SourceType::Photo,
        "text" => SourceType::Text,
        _ => SourceType::Manual,
    }
}

fn source_type_name(t: SourceType) -> &'static str {
    match t {
        SourceType::Manual => "manual",
        SourceType::Link => "link",
        SourceType::Photo => "photo",
        SourceType::Text => "text",
    }
}

// The household `plate_treatment` setting is not applied here (the port leaves that to the service), so there is
// no join on `household_settings` and `image_display_file` is the rendition whenever one exists.
const SUMMARY_SELECT: &str = "
    select r.id, r.title, r.description, r.total_minutes, r.source_type, r.updated_at,
           i.file_name as image_file,
           i.display_file_name as image_display_file,
           coalesce((select array_agg(t.name::text order by t.name)
                     from recipe_tags rt join tags t on t.id = rt.tag_id where rt.recipe_id = r.id), '{}') as tags
    from recipes r left join images i on i.id = r.image_id";

const LIST_WHERE: &str = "
    where r.deleted_at is null
      and ($1::citext is null or exists (select 1 from recipe_tags rt join tags t on t.id = rt.tag_id
                                         where rt.recipe_id = r.id and t.name = $1::citext))
      and ($2::text is null
           or r.search @@ websearch_to_tsquery('simple', $2)
           or r.title ilike $3
           or r.search @@ to_tsquery('simple', $4)
           or exists (select 1 from recipe_tags rt join tags t on t.id = rt.tag_id
                      where rt.recipe_id = r.id and t.name::text ilike $3))";

/// `$3`: the query as an escaped `ilike` title prefix. `$4`: a prefix tsquery (`weeknight & lasag:*`) so a
/// half-typed word finds "Weeknight lasagne"; none when the query uses websearch operators, which keep their
/// meaning in the `websearch_to_tsquery` term only.
fn search_terms(q: &str) -> (String, Option<String>) {
    let like = format!("{}%", escape_like(q));
    let words: Vec<&str> = q.split_whitespace().collect();
    if q.contains('"')
        || words
            .iter()
            .any(|w| w.starts_with('-') || w.eq_ignore_ascii_case("or"))
    {
        return (like, None);
    }
    let mut terms: Vec<String> = words
        .iter()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect();
    if let Some(last) = terms.last_mut() {
        last.push_str(":*");
    }
    (like, (!terms.is_empty()).then(|| terms.join(" & ")))
}

/// Makes `s` literal inside an `ilike` pattern (backslash is the default escape character).
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[derive(sqlx::FromRow)]
struct SummaryRow {
    id: Uuid,
    title: String,
    description: String,
    total_minutes: Option<i32>,
    tags: Vec<String>,
    image_file: Option<String>,
    image_display_file: Option<String>,
    source_type: String,
    updated_at: DateTime<Utc>,
}

impl From<SummaryRow> for RecipeSummary {
    fn from(r: SummaryRow) -> Self {
        Self {
            id: r.id,
            title: r.title,
            description: r.description,
            total_minutes: r.total_minutes,
            tags: r.tags,
            image_file: r.image_file,
            image_display_file: r.image_display_file,
            source_type: source_type(&r.source_type),
            updated_at: r.updated_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct RecipeRow {
    id: Uuid,
    title: String,
    description: String,
    ingredients: Json<Vec<Line>>,
    steps: Json<Vec<Line>>,
    servings: Option<String>,
    prep_minutes: Option<i32>,
    cook_minutes: Option<i32>,
    total_minutes: Option<i32>,
    notes: String,
    source_url: Option<String>,
    source_name: Option<String>,
    source_type: String,
    image_id: Option<Uuid>,
    image_file: Option<String>,
    image_display_file: Option<String>,
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

fn user_ref(id: Option<Uuid>, name: Option<String>) -> Option<UserRef> {
    Some(UserRef {
        id: id?,
        display_name: name?,
    })
}

impl From<RecipeRow> for Recipe {
    fn from(r: RecipeRow) -> Self {
        Self {
            id: r.id,
            title: r.title,
            description: r.description,
            ingredients: r.ingredients.0.into_iter().map(Into::into).collect(),
            steps: r.steps.0.into_iter().map(Into::into).collect(),
            servings: r.servings,
            prep_minutes: r.prep_minutes,
            cook_minutes: r.cook_minutes,
            total_minutes: r.total_minutes,
            notes: r.notes,
            source_url: r.source_url,
            source_name: r.source_name,
            source_type: source_type(&r.source_type),
            image_id: r.image_id,
            photo_image_ids: r.photo_image_ids,
            tags: r.tags,
            image_file: r.image_file,
            image_display_file: r.image_display_file,
            photo_files: r.photo_files,
            created_by: user_ref(r.created_by, r.created_by_name),
            updated_by: user_ref(r.updated_by, r.updated_by_name),
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

fn not_found() -> DomainError {
    DomainError::NotFound("Recipe not found.".into())
}

fn unknown_image() -> DomainError {
    DomainError::validation("imageId/photoImageIds: unknown image.")
}

/// Rejects unknown image ids up front so they are a validation error, not a foreign-key failure.
async fn check_images(tx: &mut Transaction<'_, Postgres>, input: &RecipeInput) -> DomainResult<()> {
    let mut ids = input.photo_image_ids.clone();
    ids.extend(input.image_id);
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Ok(());
    }
    let found: i64 = sqlx::query_scalar("select count(*) from images where id = any($1)")
        .bind(&ids)
        .fetch_one(&mut **tx)
        .await
        .map_err(db)?;
    if found as usize != ids.len() {
        return Err(unknown_image());
    }
    Ok(())
}

/// Writes all fields, tags and photos of an existing row (full replace).
async fn save(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    user_id: Uuid,
    now: DateTime<Utc>,
    r: &RecipeInput,
) -> DomainResult<()> {
    let lines = |v: &[Ingredient]| Json(v.iter().map(Line::from).collect::<Vec<_>>());
    sqlx::query(
        "update recipes set title = $2, description = $3, ingredients = $4, steps = $5, servings = $6,
             prep_minutes = $7, cook_minutes = $8, total_minutes = $9, notes = $10, source_url = $11,
             source_name = $12, source_type = $13, image_id = $14, updated_by = $15, updated_at = $16
         where id = $1",
    )
    .bind(id)
    .bind(&r.title)
    .bind(&r.description)
    .bind(lines(&r.ingredients))
    .bind(lines(&r.steps))
    .bind(&r.servings)
    .bind(r.prep_minutes)
    .bind(r.cook_minutes)
    .bind(r.total_minutes)
    .bind(&r.notes)
    .bind(&r.source_url)
    .bind(&r.source_name)
    .bind(source_type_name(r.source_type))
    .bind(r.image_id)
    .bind(user_id)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(image_gone_or_db)?;

    sqlx::query("delete from recipe_tags where recipe_id = $1")
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(db)?;
    if !r.tags.is_empty() {
        sqlx::query(
            "insert into tags (name) select unnest($1::text[]) on conflict (name) do nothing",
        )
        .bind(&r.tags)
        .execute(&mut **tx)
        .await
        .map_err(db)?;
        sqlx::query(
            "insert into recipe_tags (recipe_id, tag_id)
             select $1, id from tags where name = any($2::citext[])",
        )
        .bind(id)
        .bind(&r.tags)
        .execute(&mut **tx)
        .await
        .map_err(db)?;
    }

    sqlx::query("delete from recipe_photos where recipe_id = $1")
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(db)?;
    sqlx::query(
        "insert into recipe_photos (recipe_id, image_id, position)
         select $1, p.id, (p.ord - 1)::int from unnest($2::uuid[]) with ordinality as p(id, ord)",
    )
    .bind(id)
    .bind(&r.photo_image_ids)
    .execute(&mut **tx)
    .await
    .map_err(image_gone_or_db)?;
    Ok(())
}

/// An image deleted between the check and the write is still an unknown image to the caller.
fn image_gone_or_db(e: sqlx::Error) -> DomainError {
    match violation(&e) {
        Some(sqlx::error::ErrorKind::ForeignKeyViolation) => unknown_image(),
        _ => db(e),
    }
}

impl PgRecipeRepo {
    /// Loads a live (not deleted) recipe with tags, photos and user refs.
    async fn load(&self, id: Uuid) -> DomainResult<Option<Recipe>> {
        let row = sqlx::query_as::<_, RecipeRow>(
            "select r.id, r.title, r.description, r.ingredients, r.steps, r.servings, r.prep_minutes,
                    r.cook_minutes, r.total_minutes, r.notes, r.source_url, r.source_name, r.source_type,
                    r.image_id, i.file_name as image_file,
                    i.display_file_name as image_display_file,
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
        .fetch_optional(&self.pool)
        .await
        .map_err(db)?;
        Ok(row.map(Into::into))
    }
}

#[async_trait]
impl RecipeRepo for PgRecipeRepo {
    async fn create(&self, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let mut ids = self.create_many(user_id, vec![input]).await?;
        let id = ids.pop().ok_or_else(not_found)?;
        self.load(id).await?.ok_or_else(not_found)
    }

    async fn create_many(
        &self,
        user_id: Uuid,
        inputs: Vec<RecipeInput>,
    ) -> DomainResult<Vec<Uuid>> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        let mut ids = Vec::with_capacity(inputs.len());
        for input in &inputs {
            check_images(&mut tx, input).await?;
            let id: Uuid = sqlx::query_scalar(
                "insert into recipes (title, created_by, updated_by, created_at, updated_at)
                 values ($1, $2, $2, $3, $3) returning id",
            )
            .bind(&input.title)
            .bind(user_id)
            .bind(now)
            .fetch_one(&mut *tx)
            .await
            .map_err(db)?;
            save(&mut tx, id, user_id, now, input).await?;
            ids.push(id);
        }
        // Dropping `tx` on any early return above rolls everything back.
        tx.commit().await.map_err(db)?;
        Ok(ids)
    }

    async fn get(&self, id: Uuid) -> DomainResult<Option<Recipe>> {
        self.load(id).await
    }

    async fn update(&self, id: Uuid, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let mut tx = self.pool.begin().await.map_err(db)?;
        check_images(&mut tx, &input).await?;
        let live: Option<Uuid> = sqlx::query_scalar(
            "select id from recipes where id = $1 and deleted_at is null for update",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db)?;
        live.ok_or_else(not_found)?;
        save(&mut tx, id, user_id, self.clock.now(), &input).await?;
        tx.commit().await.map_err(db)?;
        self.load(id).await?.ok_or_else(not_found)
    }

    async fn soft_delete(&self, id: Uuid) -> DomainResult<()> {
        let done =
            sqlx::query("update recipes set deleted_at = $2 where id = $1 and deleted_at is null")
                .bind(id)
                .bind(self.clock.now())
                .execute(&self.pool)
                .await
                .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(not_found());
        }
        Ok(())
    }

    async fn restore(&self, id: Uuid) -> DomainResult<Recipe> {
        let deleted_at: Option<Option<DateTime<Utc>>> =
            sqlx::query_scalar("select deleted_at from recipes where id = $1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db)?;
        match deleted_at {
            None => return Err(not_found()),
            Some(None) => {} // not deleted: restoring is a no-op
            Some(Some(_)) => {
                let done = sqlx::query(
                    "update recipes set deleted_at = null
                     where id = $1 and deleted_at > $2",
                )
                .bind(id)
                .bind(self.clock.now() - Duration::minutes(i64::from(RESTORE_WINDOW_MINUTES)))
                .execute(&self.pool)
                .await
                .map_err(db)?;
                if done.rows_affected() == 0 {
                    return Err(DomainError::Conflict(format!(
                        "This recipe was deleted more than {RESTORE_WINDOW_MINUTES} minutes ago and can no longer be restored."
                    )));
                }
            }
        }
        self.load(id).await?.ok_or_else(not_found)
    }

    // From `purge` in backend/src/lib.rs. Photo and tag links go with the row (on delete cascade).
    async fn purge_deleted_before(&self, cutoff: DateTime<Utc>) -> DomainResult<u64> {
        let done = sqlx::query("delete from recipes where deleted_at < $1")
            .bind(cutoff)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(done.rows_affected())
    }

    async fn search(&self, query: SearchQuery) -> DomainResult<Page<RecipeSummary>> {
        let q = query.normalized();
        // Ranked by relevance when searching and no sort was asked for.
        let order = match (&q.sort, q.text.is_some()) {
            (Sort::Default, true) => {
                "(r.title ilike $3) desc, ts_rank(r.search, websearch_to_tsquery('simple', $2)) desc, r.created_at desc, r.id"
            }
            (Sort::Default | Sort::Newest, _) => "r.created_at desc, r.id",
            (Sort::Title, _) => "lower(r.title), r.id",
            (Sort::Time, _) => "r.total_minutes asc nulls last, lower(r.title), r.id",
        };
        let (like, prefix) = q.text.as_deref().map(search_terms).unzip();
        let prefix = prefix.flatten();

        // `order` is one of the fixed strings above, never user input.
        let sql = format!("{SUMMARY_SELECT} {LIST_WHERE} order by {order} limit $5 offset $6");
        let rows = sqlx::query_as::<_, SummaryRow>(AssertSqlSafe(sql))
            .bind(&q.tag)
            .bind(&q.text)
            .bind(&like)
            .bind(&prefix)
            .bind(q.limit)
            .bind(q.offset)
            .fetch_all(&self.pool)
            .await
            .map_err(db)?;
        let count_sql = format!("select count(*) from recipes r {LIST_WHERE}");
        let total: i64 = sqlx::query_scalar(AssertSqlSafe(count_sql))
            .bind(&q.tag)
            .bind(&q.text)
            .bind(&like)
            .bind(&prefix)
            .fetch_one(&self.pool)
            .await
            .map_err(db)?;
        Ok(Page {
            items: rows.into_iter().map(Into::into).collect(),
            total,
        })
    }

    // From `duplicate_of` in routes/imports.rs: the ILIKE prefilter. Hosts are escaped so `%` and `_` are literal.
    async fn live_source_urls(&self, hosts: &[String]) -> DomainResult<Vec<(Uuid, String)>> {
        if hosts.is_empty() {
            return Ok(Vec::new());
        }
        let patterns: Vec<String> = hosts
            .iter()
            .map(|h| format!("%{}%", escape_like(h)))
            .collect();
        sqlx::query_as(
            "select id, source_url from recipes
             where deleted_at is null and source_url ilike any($1) order by created_at, id",
        )
        .bind(patterns)
        .fetch_all(&self.pool)
        .await
        .map_err(db)
    }
}
