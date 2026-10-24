use async_trait::async_trait;
use domain::{DomainResult, Image, uuid::Uuid};
use ports::ImageRepo;
use sqlx::PgPool;
use std::sync::Arc;

use crate::error::db;

pub struct PgImageRepo {
    pool: PgPool,
    clock: Arc<dyn ports::Clock>,
}

impl PgImageRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn ports::Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl ImageRepo for PgImageRepo {
    // From routes/media.rs `store_image`.
    async fn add(&self, image: Image) -> DomainResult<()> {
        sqlx::query(
            "insert into images (id, file_name, display_file_name, width, height, bytes, created_by, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(image.id)
        .bind(&image.file_name)
        .bind(&image.display_file_name)
        .bind(image.width)
        .bind(image.height)
        .bind(image.bytes)
        .bind(image.created_by)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        Ok(())
    }

    // From routes/media.rs `delete_images`.
    async fn delete(&self, ids: &[Uuid]) -> DomainResult<()> {
        sqlx::query("delete from images where id = any($1)")
            .bind(ids)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }

    // From routes/media.rs `render_display`. A row that already points at exactly this file also answers `true`
    // (a concurrent run chose the same name): the caller must not delete a file a row refers to.
    async fn set_display_file(&self, id: Uuid, file_name: &str) -> DomainResult<bool> {
        let updated = sqlx::query(
            "update images set display_file_name = $2 where id = $1 and display_file_name is null",
        )
        .bind(id)
        .bind(file_name)
        .execute(&self.pool)
        .await
        .map_err(db)?
        .rows_affected();
        if updated == 1 {
            return Ok(true);
        }
        sqlx::query_scalar(
            "select exists(select 1 from images where id = $1 and display_file_name = $2)",
        )
        .bind(id)
        .bind(file_name)
        .fetch_one(&self.pool)
        .await
        .map_err(db)
    }

    // From routes/media.rs `backfill_displays`.
    async fn without_display_file(&self) -> DomainResult<Vec<Uuid>> {
        sqlx::query_scalar("select id from images where display_file_name is null order by id")
            .fetch_all(&self.pool)
            .await
            .map_err(db)
    }
}
