use std::sync::Arc;

use domain::{
    CookLogEntry, DomainError, DomainResult, NewCookLogEntry, User, chrono::NaiveDate, uuid::Uuid,
    validate,
};
use ports::{Clock, CookLogRepo, RecipeRepo};

use crate::Deps;

/// The "made it" log (REC-6). Every signed-in member can read a recipe's log and add to it; an entry can be deleted
/// by the member who made it or by an admin. A deleted recipe's log is hidden with it (404), and comes back on restore.
#[derive(Clone)]
pub struct CookLogService {
    log: Arc<dyn CookLogRepo>,
    recipes: Arc<dyn RecipeRepo>,
    clock: Arc<dyn Clock>,
}

impl CookLogService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            log: d.cook_log.clone(),
            recipes: d.recipes.clone(),
            clock: d.clock.clone(),
        }
    }

    async fn live(&self, recipe_id: Uuid) -> DomainResult<()> {
        match self.recipes.get(recipe_id).await? {
            Some(_) => Ok(()),
            None => Err(DomainError::NotFound("Recipe not found.".into())),
        }
    }

    /// Newest first. `NotFound` for a missing or deleted recipe.
    pub async fn list(&self, recipe_id: Uuid) -> DomainResult<Vec<CookLogEntry>> {
        self.live(recipe_id).await?;
        self.log.list(recipe_id).await
    }

    /// Records that `user` cooked the recipe on `cooked_on`. The day may not be in the future (one day of slack for
    /// time zones ahead of the server's); the note is trimmed and capped.
    pub async fn add(
        &self,
        user: &User,
        recipe_id: Uuid,
        cooked_on: NaiveDate,
        note: &str,
    ) -> DomainResult<CookLogEntry> {
        let cooked_on = validate::cooked_on(cooked_on, self.clock.now())?;
        let note = validate::cook_note(note)?;
        self.log
            .add(NewCookLogEntry {
                recipe_id,
                user_id: user.id,
                cooked_on,
                note,
            })
            .await
    }

    /// Deletes one entry of a live recipe. `NotFound` when the recipe is missing or deleted, or the entry is not one
    /// of its own; `Forbidden` unless `user` made it or is an admin (an entry whose member was removed: admins only).
    pub async fn delete(&self, user: &User, recipe_id: Uuid, entry_id: Uuid) -> DomainResult<()> {
        self.live(recipe_id).await?;
        let entry = self
            .log
            .get(entry_id)
            .await?
            .filter(|e| e.recipe_id == recipe_id)
            .ok_or_else(|| DomainError::NotFound("No such entry.".into()))?;
        let mine = entry.made_by.as_ref().is_some_and(|m| m.id == user.id);
        if !mine && !user.is_admin() {
            return Err(DomainError::Forbidden(
                "Only the member who made an entry, or an admin, can delete it.".into(),
            ));
        }
        self.log.delete(entry_id).await
    }
}
