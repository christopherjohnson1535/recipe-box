//! The "made it" log (REC-6).

use std::sync::Arc;

use async_trait::async_trait;
use domain::{
    CookLogEntry, DomainError, DomainResult, NewCookLogEntry, UserRef,
    chrono::{DateTime, NaiveDate, Utc},
    uuid::Uuid,
};
use ports::{Clock, CookLogRepo};
use sqlx::PgPool;

use crate::error::db;

#[derive(sqlx::FromRow)]
struct Row {
    id: Uuid,
    recipe_id: Uuid,
    cooked_on: NaiveDate,
    note: String,
    created_at: DateTime<Utc>,
    user_id: Option<Uuid>,
    display_name: Option<String>,
}

impl From<Row> for CookLogEntry {
    fn from(r: Row) -> Self {
        Self {
            id: r.id,
            recipe_id: r.recipe_id,
            cooked_on: r.cooked_on,
            note: r.note,
            made_by: r
                .user_id
                .zip(r.display_name)
                .map(|(id, display_name)| UserRef { id, display_name }),
            created_at: r.created_at,
        }
    }
}

/// Entries with their cook's current name.
const SELECT: &str =
    "select c.id, c.recipe_id, c.cooked_on, c.note, c.created_at, u.id as user_id, u.display_name
     from cook_log c left join users u on u.id = c.user_id";

pub struct PgCookLogRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgCookLogRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl CookLogRepo for PgCookLogRepo {
    async fn add(&self, entry: NewCookLogEntry) -> DomainResult<CookLogEntry> {
        let id = Uuid::new_v4();
        // One statement: the row only goes in while the recipe is live. `for share` keeps a concurrent soft delete
        // from slipping between the check and the insert.
        let inserted = sqlx::query(
            "with live as (select id from recipes where id = $2 and deleted_at is null for share)
             insert into cook_log (id, recipe_id, user_id, cooked_on, note, created_at)
             select $1, live.id, $3, $4, $5, $6 from live",
        )
        .bind(id)
        .bind(entry.recipe_id)
        .bind(entry.user_id)
        .bind(entry.cooked_on)
        .bind(&entry.note)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        if inserted.rows_affected() == 0 {
            return Err(DomainError::NotFound("Recipe not found.".into()));
        }
        self.get(id)
            .await?
            .ok_or_else(|| DomainError::Internal("cook log entry vanished".into()))
    }

    async fn list(&self, recipe_id: Uuid) -> DomainResult<Vec<CookLogEntry>> {
        let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!(
            "{SELECT} where c.recipe_id = $1 order by c.cooked_on desc, c.created_at desc, c.id desc"
        )))
        .bind(recipe_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn get(&self, id: Uuid) -> DomainResult<Option<CookLogEntry>> {
        let row =
            sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} where c.id = $1")))
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db)?;
        Ok(row.map(Into::into))
    }

    async fn delete(&self, id: Uuid) -> DomainResult<()> {
        let done = sqlx::query("delete from cook_log where id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(DomainError::NotFound("No such entry.".into()));
        }
        Ok(())
    }
}
