use std::sync::Arc;

use domain::{
    DomainError, DomainResult, Page, Recipe, RecipeInput, RecipeSummary, SearchQuery, Settings,
    Sort, TagCount, uuid::Uuid, validate,
};
use ports::{RecipeRepo, SettingsRepo, TagRepo};

use crate::Deps;

/// Recipes. The household `plate_treatment` setting is applied here: when it is off, `image_display_file` is
/// cleared on everything returned, so adapters and HTTP types never look at the setting.
#[derive(Clone)]
pub struct RecipeService {
    recipes: Arc<dyn RecipeRepo>,
    settings: Arc<dyn SettingsRepo>,
}

impl RecipeService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            recipes: d.recipes.clone(),
            settings: d.settings.clone(),
        }
    }

    async fn plate(&self) -> DomainResult<bool> {
        Ok(self.settings.get().await?.plate_treatment)
    }

    async fn shown(&self, mut recipe: Recipe) -> DomainResult<Recipe> {
        if !self.plate().await? {
            recipe.image_display_file = None;
        }
        Ok(recipe)
    }

    /// `limit` must be 1–200, `offset` 0 or more, and `sort` (as sent) `newest`, `title` or `time`; none means
    /// relevance when there is search text, else newest. Checked in that order: the first failure is reported.
    pub async fn search(
        &self,
        text: Option<String>,
        tag: Option<String>,
        sort: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Page<RecipeSummary>> {
        if !(1..=200).contains(&limit) {
            return Err(DomainError::validation("limit: 1–200."));
        }
        if offset < 0 {
            return Err(DomainError::validation("offset: must be 0 or more."));
        }
        let sort = match sort {
            None => Sort::Default,
            Some("newest") => Sort::Newest,
            Some("title") => Sort::Title,
            Some("time") => Sort::Time,
            Some(_) => return Err(DomainError::validation("sort: newest, title or time.")),
        };
        let mut page = self
            .recipes
            .search(SearchQuery {
                text,
                tag,
                sort,
                limit,
                offset,
            })
            .await?;
        if !self.plate().await? {
            for r in &mut page.items {
                r.image_display_file = None;
            }
        }
        Ok(page)
    }

    /// Validates the input first, then saves.
    pub async fn create(&self, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let recipe = self
            .recipes
            .create(user_id, validate::recipe(input)?)
            .await?;
        self.shown(recipe).await
    }

    /// A full replace; validates the input first.
    pub async fn update(
        &self,
        id: Uuid,
        user_id: Uuid,
        input: RecipeInput,
    ) -> DomainResult<Recipe> {
        let recipe = self
            .recipes
            .update(id, user_id, validate::recipe(input)?)
            .await?;
        self.shown(recipe).await
    }

    pub async fn get(&self, id: Uuid) -> DomainResult<Recipe> {
        let recipe = self
            .recipes
            .get(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Recipe not found.".into()))?;
        self.shown(recipe).await
    }

    /// Soft delete.
    pub async fn delete(&self, id: Uuid) -> DomainResult<()> {
        self.recipes.soft_delete(id).await
    }

    /// Undoes a delete made inside the restore window (the repository decides).
    pub async fn restore(&self, id: Uuid) -> DomainResult<Recipe> {
        let recipe = self.recipes.restore(id).await?;
        self.shown(recipe).await
    }

    /// The duplicate-import prefilter, straight from the repository.
    pub async fn live_source_urls(&self, hosts: &[String]) -> DomainResult<Vec<(Uuid, String)>> {
        self.recipes.live_source_urls(hosts).await
    }
}

#[derive(Clone)]
pub struct SettingsService {
    settings: Arc<dyn SettingsRepo>,
}

impl SettingsService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            settings: d.settings.clone(),
        }
    }

    pub async fn get(&self) -> DomainResult<Settings> {
        self.settings.get().await
    }

    pub async fn set(&self, settings: Settings) -> DomainResult<Settings> {
        self.settings.set(settings).await
    }
}

#[derive(Clone)]
pub struct TagService {
    tags: Arc<dyn TagRepo>,
}

impl TagService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            tags: d.tags.clone(),
        }
    }

    pub async fn list_in_use(&self) -> DomainResult<Vec<TagCount>> {
        self.tags.list_in_use().await
    }
}
