use std::{collections::HashSet, sync::Arc};

use domain::{
    DomainError, DomainResult, Page, Recipe, RecipeInput, RecipeSummary, SearchQuery, Settings,
    Sort, TagCount, uuid::Uuid, validate,
};
use ports::{FavouriteRepo, RecipeRepo, SettingsRepo, TagRepo};

use crate::Deps;

/// A list of recipes as asked for, before the service checks it.
#[derive(Debug, Clone, Default)]
pub struct ListRequest {
    /// Search text; blank means none.
    pub text: Option<String>,
    pub tag: Option<String>,
    /// Only the viewer's own favourites.
    pub favourites: bool,
    /// As sent: `newest`, `title` or `time`.
    pub sort: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

/// Recipes. The household `plate_treatment` setting is applied here: when it is off, `image_display_file` is
/// cleared on everything returned, so adapters and HTTP types never look at the setting. So is `is_favourite`, for
/// the member (`viewer`) the recipe is shown to: stars are per member (REC-5), never shared.
#[derive(Clone)]
pub struct RecipeService {
    recipes: Arc<dyn RecipeRepo>,
    settings: Arc<dyn SettingsRepo>,
    favourites: Arc<dyn FavouriteRepo>,
}

impl RecipeService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            recipes: d.recipes.clone(),
            settings: d.settings.clone(),
            favourites: d.favourites.clone(),
        }
    }

    async fn starred(&self, viewer: Uuid, ids: &[Uuid]) -> DomainResult<HashSet<Uuid>> {
        self.favourites.among(viewer, ids).await
    }

    /// The recipe as `viewer` sees it: the plate setting applied and their own star.
    async fn shown_to(&self, viewer: Uuid, recipe: Recipe) -> DomainResult<Recipe> {
        let mut recipe = self.shown(recipe).await?;
        recipe.is_favourite = self
            .starred(viewer, &[recipe.id])
            .await?
            .contains(&recipe.id);
        Ok(recipe)
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

    /// A page of recipes for `viewer`, each marked with their own star; with `favourites`, only the ones they starred
    /// (with any text, tag and sort). `limit` must be 1–200, `offset` 0 or more, and `sort` (as sent) `newest`,
    /// `title` or `time`; none means relevance when there is search text, else newest. Checked in that order: the
    /// first failure is reported.
    pub async fn search(
        &self,
        viewer: Uuid,
        req: ListRequest,
    ) -> DomainResult<Page<RecipeSummary>> {
        let ListRequest {
            text,
            tag,
            favourites,
            sort,
            limit,
            offset,
        } = req;
        if !(1..=200).contains(&limit) {
            return Err(DomainError::validation("limit: 1–200."));
        }
        if offset < 0 {
            return Err(DomainError::validation("offset: must be 0 or more."));
        }
        let sort = match sort.as_deref() {
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
                favourite_of: favourites.then_some(viewer),
                sort,
                limit,
                offset,
            })
            .await?;
        let plate = self.plate().await?;
        let ids: Vec<Uuid> = page.items.iter().map(|r| r.id).collect();
        let starred = self.starred(viewer, &ids).await?;
        for r in &mut page.items {
            if !plate {
                r.image_display_file = None;
            }
            r.is_favourite = starred.contains(&r.id);
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

    /// A full replace; validates the input first. Shown to the member who made the change.
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
        self.shown_to(user_id, recipe).await
    }

    pub async fn get(&self, viewer: Uuid, id: Uuid) -> DomainResult<Recipe> {
        let recipe = self
            .recipes
            .get(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Recipe not found.".into()))?;
        self.shown_to(viewer, recipe).await
    }

    /// Stars a live recipe for `user_id` (again is fine). `NotFound` for a missing or deleted recipe.
    pub async fn favourite(&self, user_id: Uuid, id: Uuid) -> DomainResult<()> {
        self.favourites.add(user_id, id).await
    }

    /// Takes `user_id`'s star off a live recipe (none is fine). `NotFound` for a missing or deleted recipe, as for
    /// every other route of a deleted recipe; its star comes back if it is restored.
    pub async fn unfavourite(&self, user_id: Uuid, id: Uuid) -> DomainResult<()> {
        if self.recipes.get(id).await?.is_none() {
            return Err(DomainError::NotFound("Recipe not found.".into()));
        }
        self.favourites.remove(user_id, id).await
    }

    /// Soft delete.
    pub async fn delete(&self, id: Uuid) -> DomainResult<()> {
        self.recipes.soft_delete(id).await
    }

    /// Undoes a delete made inside the restore window (the repository decides). Stars come back with the recipe.
    pub async fn restore(&self, viewer: Uuid, id: Uuid) -> DomainResult<Recipe> {
        let recipe = self.recipes.restore(id).await?;
        self.shown_to(viewer, recipe).await
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
