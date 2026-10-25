//! Members' links to identity-provider accounts.

use std::sync::Arc;

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Identity, NewIdentity,
    chrono::{DateTime, Utc},
    uuid::Uuid,
};
use ports::{Clock, IdentityRepo};
use sqlx::{PgPool, error::ErrorKind};

use crate::error::{db, violation};

/// `email` is citext, so it is cast for decoding.
const COLUMNS: &str = "id, user_id, provider, subject, email::text as email, created_at";

#[derive(sqlx::FromRow)]
struct Row {
    id: Uuid,
    user_id: Uuid,
    provider: String,
    subject: String,
    email: String,
    created_at: DateTime<Utc>,
}

impl From<Row> for Identity {
    fn from(r: Row) -> Self {
        Self {
            id: r.id,
            user_id: r.user_id,
            provider: r.provider,
            subject: r.subject,
            email: r.email,
            created_at: r.created_at,
        }
    }
}

pub struct PgIdentityRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgIdentityRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl IdentityRepo for PgIdentityRepo {
    async fn find(&self, provider: &str, subject: &str) -> DomainResult<Option<Identity>> {
        let sql =
            format!("select {COLUMNS} from user_identities where provider = $1 and subject = $2");
        let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
            .bind(provider)
            .bind(subject)
            .fetch_optional(&self.pool)
            .await
            .map_err(db)?;
        Ok(row.map(Into::into))
    }

    async fn list(&self, user_id: Uuid) -> DomainResult<Vec<Identity>> {
        let sql = format!(
            "select {COLUMNS} from user_identities where user_id = $1 order by created_at, id"
        );
        let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(db)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    // The unique key (provider, subject) decides between two links of one account.
    async fn create(&self, new: NewIdentity) -> DomainResult<Identity> {
        let sql = format!(
            "insert into user_identities (user_id, provider, subject, email, created_at)
             values ($1, $2, $3, $4, $5) returning {COLUMNS}"
        );
        let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
            .bind(new.user_id)
            .bind(&new.provider)
            .bind(&new.subject)
            .bind(&new.email)
            .bind(self.clock.now())
            .fetch_one(&self.pool)
            .await
            .map_err(|e| match violation(&e) {
                Some(ErrorKind::UniqueViolation) => {
                    DomainError::Conflict("That account is already linked.".into())
                }
                Some(ErrorKind::ForeignKeyViolation) => {
                    DomainError::NotFound("No such user.".into())
                }
                _ => db(e),
            })?;
        Ok(row.into())
    }

    async fn delete(&self, user_id: Uuid, id: Uuid) -> DomainResult<()> {
        let done = sqlx::query("delete from user_identities where id = $1 and user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(DomainError::NotFound("No such linked account.".into()));
        }
        Ok(())
    }
}
