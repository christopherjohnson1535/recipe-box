//! Recipe extraction from HTML. Owned by the link-import issue (LNK-1/2/5/7). Add `scraper` to Cargo.toml then.
//!
//! The implementation must:
//! - read every `<script type="application/ld+json">`, walk arrays and `@graph`, and pick the first object whose
//!   `@type` is or contains `Recipe`;
//! - map `name`, `description`, `recipeIngredient`, `recipeInstructions` (string | HowToStep | HowToSection →
//!   `section`), `recipeYield` → servings, `prepTime`/`cookTime`/`totalTime` (ISO 8601 durations → minutes),
//!   `image` (string | ImageObject | array → first; the importer downloads it via `safe_fetch` and stores it as
//!   an image), `author` / site name → `source_name`, `keywords`/`recipeCategory`/`recipeCuisine` → tags;
//! - fall back to schema.org microdata (`itemtype=".../Recipe"`);
//! - decode HTML entities and strip tags in text fields;
//! - return `None` when no recipe is found (the route answers 422 `no_recipe_found`);
//! - have unit tests on saved fixture pages.

use url::Url;

use crate::models::RecipeDraft;

/// Extracts a draft from `html`; `page_url` resolves relative image URLs and becomes `source_url`.
pub fn extract(_html: &str, _page_url: &Url) -> Option<RecipeDraft> {
    // Not built yet: see the module docs.
    None
}
