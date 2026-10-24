//! Users, sessions, settings, tags and the health probe.

use std::sync::Arc;

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, NewUser, Settings, TagCount, User,
    chrono::{DateTime, Utc},
    uuid::Uuid,
};
use ports::{Clock, SessionRepo, SettingsRepo, StorageHealth, TagRepo, UserRepo};
use sqlx::{PgPool, error::ErrorKind};

use crate::error::{db, violation};

/// Select list for [`UserRow`]; `username` is citext, so it is cast for decoding.
const USER_COLUMNS: &str = "id, username::text as username, display_name, role, created_at";

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    username: String,
    display_name: String,
    role: String,
    created_at: DateTime<Utc>,
}

impl From<UserRow> for User {
    fn from(r: UserRow) -> Self {
        Self {
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            role: r.role,
            created_at: r.created_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct UserWithHash {
    #[sqlx(flatten)]
    user: UserRow,
    password_hash: String,
}

fn no_such_user() -> DomainError {
    DomainError::NotFound("No such user.".into())
}

fn username_taken() -> DomainError {
    DomainError::Conflict("That username is already taken.".into())
}

pub struct PgUserRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgUserRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl UserRepo for PgUserRepo {
    // From routes/setup.rs `status`.
    async fn any(&self) -> DomainResult<bool> {
        sqlx::query_scalar("select exists (select 1 from users)")
            .fetch_one(&self.pool)
            .await
            .map_err(db)
    }

    // From routes/users.rs `create`.
    async fn create(&self, new: NewUser) -> DomainResult<User> {
        let sql = format!(
            "insert into users (username, display_name, password_hash, role, created_at)
             values ($1, $2, $3, $4, $5) returning {USER_COLUMNS}"
        );
        let row = sqlx::query_as::<_, UserRow>(sqlx::AssertSqlSafe(sql))
            .bind(&new.username)
            .bind(&new.display_name)
            .bind(&new.password_hash)
            .bind(&new.role)
            .bind(self.clock.now())
            .fetch_one(&self.pool)
            .await
            .map_err(|e| match violation(&e) {
                Some(ErrorKind::UniqueViolation) => username_taken(),
                _ => db(e),
            })?;
        Ok(row.into())
    }

    // From routes/setup.rs `create_admin`: the table lock serialises concurrent setups.
    async fn create_first_admin(&self, new: NewUser) -> DomainResult<User> {
        let mut tx = self.pool.begin().await.map_err(db)?;
        sqlx::query("lock table users in share row exclusive mode")
            .execute(&mut *tx)
            .await
            .map_err(db)?;
        let has_users: bool = sqlx::query_scalar("select exists (select 1 from users)")
            .fetch_one(&mut *tx)
            .await
            .map_err(db)?;
        if has_users {
            return Err(DomainError::Forbidden("Setup is already done.".into()));
        }
        let sql = format!(
            "insert into users (username, display_name, password_hash, role, created_at)
             values ($1, $2, $3, 'admin', $4) returning {USER_COLUMNS}"
        );
        let row = sqlx::query_as::<_, UserRow>(sqlx::AssertSqlSafe(sql))
            .bind(&new.username)
            .bind(&new.display_name)
            .bind(&new.password_hash)
            .bind(self.clock.now())
            .fetch_one(&mut *tx)
            .await
            .map_err(db)?;
        tx.commit().await.map_err(db)?;
        Ok(row.into())
    }

    // From routes/users.rs `list`.
    async fn list(&self) -> DomainResult<Vec<User>> {
        let sql =
            format!("select {USER_COLUMNS} from users order by lower(display_name), username");
        let rows = sqlx::query_as::<_, UserRow>(sqlx::AssertSqlSafe(sql))
            .fetch_all(&self.pool)
            .await
            .map_err(db)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    // From routes/auth.rs `login`. The caller trims the username, as the route did.
    async fn find_with_hash(&self, username: &str) -> DomainResult<Option<(User, String)>> {
        let sql =
            format!("select {USER_COLUMNS}, password_hash from users where username = $1::citext");
        let found = sqlx::query_as::<_, UserWithHash>(sqlx::AssertSqlSafe(sql))
            .bind(username)
            .fetch_optional(&self.pool)
            .await
            .map_err(db)?;
        Ok(found.map(|f| (f.user.into(), f.password_hash)))
    }

    async fn password_hash(&self, id: Uuid) -> DomainResult<Option<String>> {
        sqlx::query_scalar("select password_hash from users where id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db)
    }

    // From routes/users.rs `set_password` + auth/session.rs `end_for_user`. The row lock makes the compare and the
    // write one step, so of two changes made against the same hash exactly one wins.
    async fn set_password_hash(
        &self,
        id: Uuid,
        hash: &str,
        expected: Option<&str>,
        keep_session: Option<&[u8]>,
    ) -> DomainResult<()> {
        let mut tx = self.pool.begin().await.map_err(db)?;
        let current: Option<String> =
            sqlx::query_scalar("select password_hash from users where id = $1 for update")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db)?;
        let Some(current) = current else {
            return Err(no_such_user());
        };
        if expected.is_some_and(|e| e != current) {
            return Err(DomainError::Conflict(
                "The password changed while this request was running. Try again.".into(),
            ));
        }
        sqlx::query("update users set password_hash = $2 where id = $1")
            .bind(id)
            .bind(hash)
            .execute(&mut *tx)
            .await
            .map_err(db)?;
        sqlx::query(
            "delete from sessions where user_id = $1 and ($2::bytea is null or token_hash <> $2)",
        )
        .bind(id)
        .bind(keep_session)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
        tx.commit().await.map_err(db)
    }

    // From routes/users.rs `remove`: locks every admin row plus the target, so concurrent removals can't both
    // pass the last-admin check.
    async fn remove(&self, id: Uuid) -> DomainResult<()> {
        let mut tx = self.pool.begin().await.map_err(db)?;
        let rows: Vec<(Uuid, String)> = sqlx::query_as(
            "select id, role from users where role = 'admin' or id = $1 order by id for update",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await
        .map_err(db)?;
        let Some((_, role)) = rows.iter().find(|(rid, _)| *rid == id) else {
            return Err(no_such_user());
        };
        let admins = rows.iter().filter(|(_, r)| r == "admin").count();
        if role == "admin" && admins <= 1 {
            return Err(DomainError::Forbidden(
                "You can't remove the last admin.".into(),
            ));
        }
        sqlx::query("delete from users where id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(db)?;
        tx.commit().await.map_err(db)
    }
}

pub struct PgSessionRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgSessionRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl SessionRepo for PgSessionRepo {
    // From auth/session.rs `start`.
    async fn create(
        &self,
        user_id: Uuid,
        token_hash: Vec<u8>,
        expires_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        sqlx::query(
            "insert into sessions (user_id, token_hash, created_at, expires_at) values ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(token_hash)
        .bind(self.clock.now())
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(|e| match violation(&e) {
            Some(ErrorKind::ForeignKeyViolation) => no_such_user(),
            Some(ErrorKind::UniqueViolation) => {
                DomainError::Conflict("That session already exists.".into())
            }
            _ => db(e),
        })?;
        Ok(())
    }

    // From auth/extract.rs `CurrentUser`.
    async fn user_for_token(&self, token_hash: &[u8]) -> DomainResult<Option<User>> {
        let sql = format!(
            "select {USER_COLUMNS} from users
             where id = (select user_id from sessions where token_hash = $1 and expires_at > $2)"
        );
        let row = sqlx::query_as::<_, UserRow>(sqlx::AssertSqlSafe(sql))
            .bind(token_hash)
            .bind(self.clock.now())
            .fetch_optional(&self.pool)
            .await
            .map_err(db)?;
        Ok(row.map(Into::into))
    }

    // From auth/session.rs `end`.
    async fn delete(&self, token_hash: &[u8]) -> DomainResult<()> {
        sqlx::query("delete from sessions where token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }

    // From `purge` in backend/src/lib.rs.
    async fn purge_expired(&self) -> DomainResult<u64> {
        let done = sqlx::query("delete from sessions where expires_at < $1")
            .bind(self.clock.now())
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(done.rows_affected())
    }
}

pub struct PgSettingsRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgSettingsRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

#[async_trait]
impl SettingsRepo for PgSettingsRepo {
    // From routes/settings.rs.
    async fn get(&self) -> DomainResult<Settings> {
        let plate_treatment = sqlx::query_scalar("select plate_treatment from household_settings")
            .fetch_one(&self.pool)
            .await
            .map_err(db)?;
        Ok(Settings { plate_treatment })
    }

    async fn set(&self, settings: Settings) -> DomainResult<Settings> {
        let plate_treatment = sqlx::query_scalar(
            "update household_settings set plate_treatment = $1, updated_at = $2 returning plate_treatment",
        )
        .bind(settings.plate_treatment)
        .bind(self.clock.now())
        .fetch_one(&self.pool)
        .await
        .map_err(db)?;
        Ok(Settings { plate_treatment })
    }
}

pub struct PgTagRepo {
    pool: PgPool,
}

impl PgTagRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct TagRow {
    name: String,
    count: i64,
}

#[async_trait]
impl TagRepo for PgTagRepo {
    // From routes/tags.rs.
    async fn list_in_use(&self) -> DomainResult<Vec<TagCount>> {
        let rows = sqlx::query_as::<_, TagRow>(
            "select t.name::text as name, count(*) as count
             from tags t
             join recipe_tags rt on rt.tag_id = t.id
             join recipes r on r.id = rt.recipe_id and r.deleted_at is null
             group by t.id, t.name
             order by t.name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db)?;
        Ok(rows
            .into_iter()
            .map(|r| TagCount {
                name: r.name,
                count: r.count,
            })
            .collect())
    }
}

pub struct PgStorageHealth {
    pool: PgPool,
}

impl PgStorageHealth {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl StorageHealth for PgStorageHealth {
    // From routes/health.rs.
    async fn ping(&self) -> DomainResult<()> {
        sqlx::query("select 1")
            .execute(&self.pool)
            .await
            .map_err(db)?;
        Ok(())
    }
}
