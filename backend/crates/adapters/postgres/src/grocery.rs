//! The grocery list (GRO): one list, its recipes and items, and the household's section choices and staples.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Ingredient,
    chrono::{DateTime, Utc},
    grocery::{Amount, Section},
    uuid::Uuid,
};
use ports::{Clock, Compute, GroceryItem, GroceryList, GroceryRepo, ListedRecipe, NewGroceryItem};
use sqlx::{Executor, PgPool, Postgres, error::ErrorKind, types::Json};

use crate::{
    error::{db, violation},
    recipes::Line,
};

pub struct PgGroceryRepo {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

impl PgGroceryRepo {
    pub fn new(pool: PgPool, clock: Arc<dyn Clock>) -> Self {
        Self { pool, clock }
    }
}

const ITEM_COLUMNS: &str = "id, key, name, amounts, section, checked, manual, recipe_ids";

#[derive(sqlx::FromRow)]
struct ItemRow {
    id: Uuid,
    key: String,
    name: String,
    amounts: Json<Vec<Amount>>,
    section: String,
    checked: bool,
    manual: bool,
    recipe_ids: Vec<Uuid>,
}

impl TryFrom<ItemRow> for GroceryItem {
    type Error = DomainError;

    fn try_from(r: ItemRow) -> DomainResult<Self> {
        Ok(Self {
            id: r.id,
            key: r.key,
            name: r.name,
            amounts: r.amounts.0,
            section: Section::parse(&r.section)
                .ok_or_else(|| DomainError::Internal(format!("unknown section {:?}", r.section)))?,
            checked: r.checked,
            manual: r.manual,
            recipe_ids: r.recipe_ids,
        })
    }
}

#[derive(sqlx::FromRow)]
struct RecipeRow {
    recipe_id: Uuid,
    scale: f64,
    title: String,
    servings: Option<String>,
    image_file: Option<String>,
    ingredients: Json<Vec<Line>>,
}

fn no_list() -> DomainError {
    DomainError::NotFound("No such list.".into())
}

fn no_item() -> DomainError {
    DomainError::NotFound("No such item.".into())
}

/// Amounts go through `jsonb` and back, which may move the last digit of a float. They are the same when they
/// agree to far more digits than anyone shops with.
fn same_amounts(a: &[Amount], b: &[Amount]) -> bool {
    let close = |x: f64, y: f64| (x - y).abs() <= 1e-9 * x.abs().max(y.abs());
    a.len() == b.len()
        && a.iter().zip(b).all(|(x, y)| {
            x.unit == y.unit
                && close(x.min, y.min)
                && match (x.max, y.max) {
                    (None, None) => true,
                    (Some(p), Some(q)) => close(p, q),
                    _ => false,
                }
        })
}

async fn touch(
    e: impl Executor<'_, Database = Postgres>,
    list_id: Uuid,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    sqlx::query("update grocery_list set updated_at = $2 where id = $1")
        .bind(list_id)
        .bind(now)
        .execute(e)
        .await
        .map_err(db)?;
    Ok(())
}

async fn listed_recipes(
    e: impl Executor<'_, Database = Postgres>,
    list_id: Uuid,
) -> DomainResult<Vec<ListedRecipe>> {
    let rows = sqlx::query_as::<_, RecipeRow>(
        "select r.id as recipe_id, lr.scale, r.title, r.servings, i.file_name as image_file, r.ingredients
         from grocery_list_recipe lr
         join recipes r on r.id = lr.recipe_id and r.deleted_at is null
         left join images i on i.id = r.image_id
         where lr.list_id = $1
         order by lr.added_at, lr.recipe_id",
    )
    .bind(list_id)
    .fetch_all(e)
    .await
    .map_err(db)?;
    Ok(rows
        .into_iter()
        .map(|r| ListedRecipe {
            recipe_id: r.recipe_id,
            scale: r.scale,
            title: r.title,
            servings: r.servings,
            image_file: r.image_file,
            ingredients: r.ingredients.0.into_iter().map(Ingredient::from).collect(),
        })
        .collect())
}

async fn section_overrides(
    e: impl Executor<'_, Database = Postgres>,
) -> DomainResult<HashMap<String, Section>> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("select key, section from grocery_section_override")
            .fetch_all(e)
            .await
            .map_err(db)?;
    Ok(rows
        .into_iter()
        .filter_map(|(key, section)| Some((key, Section::parse(&section)?)))
        .collect())
}

#[async_trait]
impl GroceryRepo for PgGroceryRepo {
    async fn get_or_create_list(&self) -> DomainResult<GroceryList> {
        let now = self.clock.now();
        // The unique index on `(true)` lets one of two concurrent first calls insert and the other do nothing.
        sqlx::query(
            "insert into grocery_list (id, created_at, updated_at) values ($1, $2, $2) on conflict do nothing",
        )
        .bind(Uuid::new_v4())
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db)?;
        let (id, updated_at) = sqlx::query_as("select id, updated_at from grocery_list")
            .fetch_one(&self.pool)
            .await
            .map_err(db)?;
        Ok(GroceryList { id, updated_at })
    }

    async fn recipes(&self, list_id: Uuid) -> DomainResult<Vec<ListedRecipe>> {
        listed_recipes(&self.pool, list_id).await
    }

    async fn items(&self, list_id: Uuid) -> DomainResult<Vec<GroceryItem>> {
        let sql =
            format!("select {ITEM_COLUMNS} from grocery_item where list_id = $1 and not cleared");
        sqlx::query_as::<_, ItemRow>(sqlx::AssertSqlSafe(sql))
            .bind(list_id)
            .fetch_all(&self.pool)
            .await
            .map_err(db)?
            .into_iter()
            .map(GroceryItem::try_from)
            .collect()
    }

    async fn item(&self, id: Uuid) -> DomainResult<Option<GroceryItem>> {
        let sql = format!("select {ITEM_COLUMNS} from grocery_item where id = $1 and not cleared");
        sqlx::query_as::<_, ItemRow>(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db)?
            .map(GroceryItem::try_from)
            .transpose()
    }

    async fn add_recipe(&self, list_id: Uuid, recipe_id: Uuid, scale: f64) -> DomainResult<()> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        let done = sqlx::query(
            "insert into grocery_list_recipe (list_id, recipe_id, scale, added_at)
             select $1, id, $3, $4 from recipes where id = $2 and deleted_at is null
             on conflict (list_id, recipe_id) do update set scale = excluded.scale",
        )
        .bind(list_id)
        .bind(recipe_id)
        .bind(scale)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| match violation(&e) {
            // An unknown list, or a recipe purged between the check and the insert.
            Some(ErrorKind::ForeignKeyViolation) => {
                DomainError::NotFound("Recipe not found.".into())
            }
            _ => db(e),
        })?;
        if done.rows_affected() == 0 {
            return Err(DomainError::NotFound("Recipe not found.".into()));
        }
        touch(&mut *tx, list_id, now).await?;
        tx.commit().await.map_err(db)
    }

    async fn remove_recipe(&self, list_id: Uuid, recipe_id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        let done =
            sqlx::query("delete from grocery_list_recipe where list_id = $1 and recipe_id = $2")
                .bind(list_id)
                .bind(recipe_id)
                .execute(&mut *tx)
                .await
                .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(DomainError::NotFound(
                "That recipe is not on the list.".into(),
            ));
        }
        touch(&mut *tx, list_id, now).await?;
        tx.commit().await.map_err(db)
    }

    // The row lock serialises concurrent recomputes: the second waits, then reads the recipes the first saw too.
    async fn recompute(&self, list_id: Uuid, compute: &Compute) -> DomainResult<()> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        let locked: Option<Uuid> =
            sqlx::query_scalar("select id from grocery_list where id = $1 for update")
                .bind(list_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db)?;
        locked.ok_or_else(no_list)?;
        let recipes = listed_recipes(&mut *tx, list_id).await?;
        let overrides = section_overrides(&mut *tx).await?;
        let computed = compute(&recipes, &overrides);

        let sql =
            format!("select {ITEM_COLUMNS} from grocery_item where list_id = $1 and not manual");
        let stored = sqlx::query_as::<_, ItemRow>(sqlx::AssertSqlSafe(sql))
            .bind(list_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(db)?;
        let mut stored: HashMap<String, ItemRow> =
            stored.into_iter().map(|r| (r.key.clone(), r)).collect();

        let mut changed = false;
        for c in &computed {
            let section = c.section.as_str();
            match stored.remove(&c.key) {
                None => {
                    sqlx::query(
                        "insert into grocery_item (id, list_id, key, name, amounts, section, recipe_ids)
                         values ($1, $2, $3, $4, $5, $6, $7)",
                    )
                    .bind(Uuid::new_v4())
                    .bind(list_id)
                    .bind(&c.key)
                    .bind(&c.name)
                    .bind(Json(&c.amounts))
                    .bind(section)
                    .bind(&c.recipe_ids)
                    .execute(&mut *tx)
                    .await
                    .map_err(db)?;
                    changed = true;
                }
                Some(old) => {
                    let more = !same_amounts(&old.amounts.0, &c.amounts);
                    if !(more
                        || old.name != c.name
                        || old.section != section
                        || old.recipe_ids != c.recipe_ids)
                    {
                        continue;
                    }
                    sqlx::query(
                        "update grocery_item
                         set name = $2, amounts = $3, section = $4, recipe_ids = $5,
                             checked = checked and not $6, cleared = cleared and not $6
                         where id = $1",
                    )
                    .bind(old.id)
                    .bind(&c.name)
                    .bind(Json(&c.amounts))
                    .bind(section)
                    .bind(&c.recipe_ids)
                    .bind(more)
                    .execute(&mut *tx)
                    .await
                    .map_err(db)?;
                    changed = true;
                }
            }
        }
        // What is left in `stored` is no longer computed.
        if !stored.is_empty() {
            let gone: Vec<Uuid> = stored.values().map(|r| r.id).collect();
            sqlx::query("delete from grocery_item where id = any($1)")
                .bind(gone)
                .execute(&mut *tx)
                .await
                .map_err(db)?;
            changed = true;
        }
        if changed {
            touch(&mut *tx, list_id, now).await?;
        }
        tx.commit().await.map_err(db)
    }

    async fn add_manual(&self, list_id: Uuid, item: NewGroceryItem) -> DomainResult<GroceryItem> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        let sql = format!(
            "insert into grocery_item (id, list_id, key, name, amounts, section, manual)
             values ($1, $2, $3, $4, $5, $6, true) returning {ITEM_COLUMNS}"
        );
        let row = sqlx::query_as::<_, ItemRow>(sqlx::AssertSqlSafe(sql))
            .bind(Uuid::new_v4())
            .bind(list_id)
            .bind(&item.key)
            .bind(&item.name)
            .bind(Json(&item.amounts))
            .bind(item.section.as_str())
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| match violation(&e) {
                Some(ErrorKind::ForeignKeyViolation) => no_list(),
                _ => db(e),
            })?;
        touch(&mut *tx, list_id, now).await?;
        tx.commit().await.map_err(db)?;
        row.try_into()
    }

    async fn set_checked(&self, id: Uuid, checked: bool) -> DomainResult<()> {
        let done = sqlx::query(
            "with u as (update grocery_item set checked = $2 where id = $1 and not cleared returning list_id)
             update grocery_list set updated_at = $3 where id in (select list_id from u)",
        )
        .bind(id)
        .bind(checked)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(no_item());
        }
        Ok(())
    }

    async fn set_section(&self, list_id: Uuid, key: &str, section: Section) -> DomainResult<()> {
        let now = self.clock.now();
        let mut tx = self.pool.begin().await.map_err(db)?;
        sqlx::query(
            "insert into grocery_section_override (key, section) values ($1, $2)
             on conflict (key) do update set section = excluded.section",
        )
        .bind(key)
        .bind(section.as_str())
        .execute(&mut *tx)
        .await
        .map_err(db)?;
        sqlx::query("update grocery_item set section = $3 where list_id = $1 and key = $2")
            .bind(list_id)
            .bind(key)
            .bind(section.as_str())
            .execute(&mut *tx)
            .await
            .map_err(db)?;
        touch(&mut *tx, list_id, now).await?;
        tx.commit().await.map_err(db)
    }

    async fn clear_item(&self, id: Uuid) -> DomainResult<()> {
        let done = sqlx::query(
            "with d as (delete from grocery_item where id = $1 and manual returning list_id),
                  c as (update grocery_item set cleared = true where id = $1 and not manual and not cleared
                        returning list_id)
             update grocery_list set updated_at = $2
             where id in (select list_id from d union all select list_id from c)",
        )
        .bind(id)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        if done.rows_affected() == 0 {
            return Err(no_item());
        }
        Ok(())
    }

    async fn clear_checked(&self, list_id: Uuid) -> DomainResult<()> {
        sqlx::query(
            "with d as (delete from grocery_item where list_id = $1 and manual and checked),
                  c as (update grocery_item set cleared = true
                        where list_id = $1 and not manual and checked and not cleared)
             update grocery_list set updated_at = $2 where id = $1",
        )
        .bind(list_id)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        Ok(())
    }

    async fn clear_all(&self, list_id: Uuid) -> DomainResult<()> {
        sqlx::query(
            "with r as (delete from grocery_list_recipe where list_id = $1),
                  i as (delete from grocery_item where list_id = $1)
             update grocery_list set updated_at = $2 where id = $1",
        )
        .bind(list_id)
        .bind(self.clock.now())
        .execute(&self.pool)
        .await
        .map_err(db)?;
        Ok(())
    }

    async fn overrides(&self) -> DomainResult<HashMap<String, Section>> {
        section_overrides(&self.pool).await
    }

    async fn staples(&self) -> DomainResult<HashSet<String>> {
        let keys: Vec<String> = sqlx::query_scalar("select key from grocery_staple")
            .fetch_all(&self.pool)
            .await
            .map_err(db)?;
        Ok(keys.into_iter().collect())
    }

    async fn set_staple(&self, list_id: Uuid, key: &str, staple: bool) -> DomainResult<()> {
        let sql = if staple {
            "insert into grocery_staple (key) values ($1) on conflict do nothing"
        } else {
            "delete from grocery_staple where key = $1"
        };
        let mut tx = self.pool.begin().await.map_err(db)?;
        sqlx::query(sql)
            .bind(key)
            .execute(&mut *tx)
            .await
            .map_err(db)?;
        touch(&mut *tx, list_id, self.clock.now()).await?;
        tx.commit().await.map_err(db)
    }
}
