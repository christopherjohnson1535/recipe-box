//! Favourites (REC-5): each member's own stars.

use std::{collections::HashSet, sync::Arc};

use async_trait::async_trait;
use domain::{DomainError, DomainResult, uuid::Uuid};
use ports::{Clock, FavouriteRepo};
use sqlx::{PgPool, error::ErrorKind};

use crate::error::{db, violation};

pub struct PgFavouriteRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgFavouriteRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl FavouriteRepo for PgFavouriteRepo {
    async fn add(&self, user_id: Uuid, recipe_id: Uuid) -> DomainResult<()> {
        // One statement: the star only goes in while the recipe is live. `for share` keeps a concurrent soft delete
        // from slipping between the check and the insert. A star already there counts as live: `returning` would
        // say nothing for it, so the recipe check is selected on its own.
        let live: Option<bool> = sqlx::query_scalar(
            "with live as (select id from recipes where id = $2 and deleted_at is null for share),
                  ins as (insert into favourites (user_id, recipe_id, created_at)
                          select $1, live.id, $3 from live
                          on conflict (user_id, recipe_id) do nothing)
             select true from live",
        )
        .bind(user_id)
        .bind(recipe_id)
        .bind(self.clock.now())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| match violation(&e) {
            // The member was removed between signing in and starring.
            Some(ErrorKind::ForeignKeyViolation) => DomainError::Unauthenticated("Please sign in."),
            _ => db(e),
        })?;
        match live {
            Some(_) => Ok(()),
            None => Err(DomainError::NotFound("Recipe not found.".into())),
        }
    }

    async fn remove(&self, user_id: Uuid, recipe_id: Uuid) -> DomainResult<()> {
        sqlx::query("delete from favourites where user_id = $1 and recipe_id = $2")
            .bind(user_id)
            .bind(recipe_id)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }

    async fn among(&self, user_id: Uuid, recipe_ids: &[Uuid]) -> DomainResult<HashSet<Uuid>> {
        if recipe_ids.is_empty() {
            return Ok(HashSet::new());
        }
        let ids: Vec<Uuid> = sqlx::query_scalar(
            "select recipe_id from favourites where user_id = $1 and recipe_id = any($2)",
        )
        .bind(user_id)
        .bind(recipe_ids)
        .fetch_all(&self.pool)
        .await
        .map_err(db)?;
        Ok(ids.into_iter().collect())
    }
}
