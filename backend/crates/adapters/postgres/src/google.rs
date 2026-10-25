//! Each member's Google connection.

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult,
    chrono::{DateTime, Utc},
    uuid::Uuid,
};
use ports::{GoogleConnection, GoogleConnectionRepo};
use sqlx::{PgPool, error::ErrorKind};

use crate::error::{db, violation};

#[derive(sqlx::FromRow)]
struct Row {
    refresh_token: Vec<u8>,
    tasklist_id: Option<String>,
    connected_at: DateTime<Utc>,
}

pub struct PgGoogleConnectionRepo {
    pool: PgPool,
}

impl PgGoogleConnectionRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl GoogleConnectionRepo for PgGoogleConnectionRepo {
    async fn get(&self, user_id: Uuid) -> DomainResult<Option<GoogleConnection>> {
        let row = sqlx::query_as::<_, Row>(
            "select refresh_token, tasklist_id, connected_at from google_connection where user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db)?;
        Ok(row.map(|r| GoogleConnection {
            sealed_token: r.refresh_token,
            tasklist_id: r.tasklist_id,
            connected_at: r.connected_at,
        }))
    }

    async fn upsert(
        &self,
        user_id: Uuid,
        sealed_token: Vec<u8>,
        connected_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        sqlx::query(
            "insert into google_connection (user_id, refresh_token, connected_at) values ($1, $2, $3)
             on conflict (user_id) do update set refresh_token = excluded.refresh_token,
                                                 connected_at = excluded.connected_at",
        )
        .bind(user_id)
        .bind(sealed_token)
        .bind(connected_at)
        .execute(&self.pool)
        .await
        .map_err(|e| match violation(&e) {
            Some(ErrorKind::ForeignKeyViolation) => DomainError::NotFound("No such user.".into()),
            _ => db(e),
        })?;
        Ok(())
    }

    async fn set_tasklist(&self, user_id: Uuid, tasklist_id: &str) -> DomainResult<()> {
        sqlx::query("update google_connection set tasklist_id = $2 where user_id = $1")
            .bind(user_id)
            .bind(tasklist_id)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }

    async fn delete(&self, user_id: Uuid) -> DomainResult<()> {
        sqlx::query("delete from google_connection where user_id = $1")
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }
}
