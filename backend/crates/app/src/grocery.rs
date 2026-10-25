//! The grocery list (GRO): what goes on it, and the rules for changing it. The storage and the line parsing are
//! elsewhere (`GroceryRepo`, `domain::grocery`); this decides when to recompute and what each change means.

use std::{collections::HashSet, sync::Arc};

use domain::{
    DomainError, DomainResult,
    chrono::{DateTime, Utc},
    grocery::{
        MAX_GROCERY_TEXT_CHARS, MAX_SCALE, MIN_SCALE, RecipeLines, Section, build_items, classify,
        parse_line, scale_servings,
    },
    uuid::Uuid,
};
use ports::{GroceryItem, GroceryList, GroceryRepo, ListedRecipe, NewGroceryItem};

use crate::Deps;

/// A recipe on the list, as the client shows it.
#[derive(Debug, Clone, PartialEq)]
pub struct GroceryRecipeView {
    pub recipe_id: Uuid,
    pub title: String,
    pub scale: f64,
    /// The recipe's servings text scaled by `scale` ("4-6" at 0.5 is "2–3").
    pub servings: Option<String>,
    /// The main photo's file name.
    pub image_file: Option<String>,
}

/// An item and whether the household always has it at home.
#[derive(Debug, Clone, PartialEq)]
pub struct GroceryItemView {
    pub item: GroceryItem,
    pub staple: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GroceryListView {
    pub id: Uuid,
    pub updated_at: DateTime<Utc>,
    pub recipes: Vec<GroceryRecipeView>,
    /// By section in shopping order, then by name. Cleared items are not here.
    pub items: Vec<GroceryItemView>,
}

/// What `PATCH /api/grocery/items/{id}` may change; at least one field must be set.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ItemPatch {
    pub checked: Option<bool>,
    pub section: Option<Section>,
    pub staple: Option<bool>,
}

#[derive(Clone)]
pub struct GroceryService {
    repo: Arc<dyn GroceryRepo>,
}

/// Whether the items no longer match the list's live recipes: an item names a recipe that is gone from the list
/// (deleted), or a live recipe that has lines contributes to no item (restored after a delete).
fn stale(recipes: &[ListedRecipe], items: &[GroceryItem]) -> bool {
    let live: HashSet<Uuid> = recipes.iter().map(|r| r.recipe_id).collect();
    let used: HashSet<Uuid> = items
        .iter()
        .flat_map(|i| i.recipe_ids.iter().copied())
        .collect();
    used.iter().any(|id| !live.contains(id))
        || recipes.iter().any(|r| {
            !used.contains(&r.recipe_id) && r.ingredients.iter().any(|i| !i.text.trim().is_empty())
        })
}

impl GroceryService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            repo: d.grocery.clone(),
        }
    }

    /// The list, made on first use. A recipe deleted (or restored) since the last write is reflected first.
    pub async fn get(&self) -> DomainResult<GroceryListView> {
        let list = self.repo.get_or_create_list().await?;
        let (recipes, items) = self.load(&list).await?;
        if !stale(&recipes, &items) {
            return self.view(list, recipes, items).await;
        }
        self.recompute(&list).await?;
        self.current().await
    }

    /// Puts a live recipe on the list, or sets the scale of one already there (`scale` 0.25 to 10, default 1).
    pub async fn add_recipe(
        &self,
        recipe_id: Uuid,
        scale: Option<f64>,
    ) -> DomainResult<GroceryListView> {
        let scale = scale.unwrap_or(1.0);
        // `contains` is false for NaN too.
        if !(MIN_SCALE..=MAX_SCALE).contains(&scale) {
            return Err(DomainError::validation(format!(
                "scale: {MIN_SCALE}-{MAX_SCALE}."
            )));
        }
        let list = self.repo.get_or_create_list().await?;
        self.repo.add_recipe(list.id, recipe_id, scale).await?;
        self.recompute(&list).await?;
        self.current().await
    }

    pub async fn remove_recipe(&self, recipe_id: Uuid) -> DomainResult<GroceryListView> {
        let list = self.repo.get_or_create_list().await?;
        self.repo.remove_recipe(list.id, recipe_id).await?;
        self.recompute(&list).await?;
        self.current().await
    }

    /// Adds a manual item: `text` (1-200 characters once trimmed) is read like an ingredient line. The section is
    /// the one given, else the household's choice for the name, else the built-in guess.
    pub async fn add_item(
        &self,
        text: &str,
        section: Option<Section>,
    ) -> DomainResult<GroceryItemView> {
        let text = text.trim();
        if !(1..=MAX_GROCERY_TEXT_CHARS).contains(&text.chars().count()) {
            return Err(DomainError::validation(format!(
                "text: 1-{MAX_GROCERY_TEXT_CHARS} characters."
            )));
        }
        let line = parse_line(text);
        let list = self.repo.get_or_create_list().await?;
        let section = match section {
            Some(s) => s,
            None => match self.repo.overrides().await?.get(&line.key) {
                Some(s) => *s,
                None => classify(&line.key),
            },
        };
        let item = self
            .repo
            .add_manual(
                list.id,
                NewGroceryItem {
                    key: line.key,
                    name: line.name,
                    amounts: line.amount.into_iter().collect(),
                    section,
                },
            )
            .await?;
        let staple = self.repo.staples().await?.contains(&item.key);
        Ok(GroceryItemView { item, staple })
    }

    /// Ticks, moves or marks an item. A new section is remembered for the item's name, so the next list files it
    /// there too, and applies to every item of that name.
    pub async fn update_item(&self, id: Uuid, patch: ItemPatch) -> DomainResult<GroceryItemView> {
        if patch == ItemPatch::default() {
            return Err(DomainError::validation("Send checked, section or staple."));
        }
        let item = self.repo.item(id).await?.ok_or_else(no_item)?;
        let list = self.repo.get_or_create_list().await?;
        if let Some(checked) = patch.checked {
            self.repo.set_checked(id, checked).await?;
        }
        if let Some(section) = patch.section {
            self.repo.set_section(list.id, &item.key, section).await?;
        }
        if let Some(staple) = patch.staple {
            self.repo.set_staple(list.id, &item.key, staple).await?;
        }
        let item = self.repo.item(id).await?.ok_or_else(no_item)?;
        let staple = self.repo.staples().await?.contains(&item.key);
        Ok(GroceryItemView { item, staple })
    }

    /// Deletes a manual item, clears a generated one (it stays off the list until its amounts change).
    pub async fn clear_item(&self, id: Uuid) -> DomainResult<()> {
        self.repo.clear_item(id).await
    }

    pub async fn clear_checked(&self) -> DomainResult<GroceryListView> {
        let list = self.repo.get_or_create_list().await?;
        self.repo.clear_checked(list.id).await?;
        self.current().await
    }

    /// Empties the list: recipes and items. The household's section choices and staples stay.
    pub async fn clear_all(&self) -> DomainResult<()> {
        let list = self.repo.get_or_create_list().await?;
        self.repo.clear_all(list.id).await
    }

    /// Rebuilds the generated items from the list's recipes. The repository runs the closure while it holds the
    /// list, so two overlapping recomputes cannot overwrite each other with a stale set of recipes.
    async fn recompute(&self, list: &GroceryList) -> DomainResult<()> {
        self.repo
            .recompute(list.id, &|recipes, overrides| {
                let lines: Vec<RecipeLines> = recipes
                    .iter()
                    .map(|r| RecipeLines {
                        recipe_id: r.recipe_id,
                        scale: r.scale,
                        ingredients: &r.ingredients,
                    })
                    .collect();
                build_items(&lines, overrides)
            })
            .await
    }

    /// The list as it is now (read after a write, so `updated_at` includes it).
    async fn current(&self) -> DomainResult<GroceryListView> {
        let list = self.repo.get_or_create_list().await?;
        let (recipes, items) = self.load(&list).await?;
        self.view(list, recipes, items).await
    }

    async fn load(
        &self,
        list: &GroceryList,
    ) -> DomainResult<(Vec<ListedRecipe>, Vec<GroceryItem>)> {
        Ok((
            self.repo.recipes(list.id).await?,
            self.repo.items(list.id).await?,
        ))
    }

    async fn view(
        &self,
        list: GroceryList,
        recipes: Vec<ListedRecipe>,
        mut items: Vec<GroceryItem>,
    ) -> DomainResult<GroceryListView> {
        let staples = self.repo.staples().await?;
        items.sort_by_cached_key(|i| (i.section, i.name.to_lowercase(), i.id));
        Ok(GroceryListView {
            id: list.id,
            updated_at: list.updated_at,
            recipes: recipes
                .into_iter()
                .map(|r| GroceryRecipeView {
                    recipe_id: r.recipe_id,
                    servings: r.servings.as_deref().map(|s| scale_servings(s, r.scale)),
                    title: r.title,
                    scale: r.scale,
                    image_file: r.image_file,
                })
                .collect(),
            items: items
                .into_iter()
                .map(|item| GroceryItemView {
                    staple: staples.contains(&item.key),
                    item,
                })
                .collect(),
        })
    }
}

fn no_item() -> DomainError {
    DomainError::NotFound("No such item.".into())
}
