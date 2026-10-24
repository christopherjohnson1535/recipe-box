//! Domain types. JSON shape and OpenAPI schemas live on the HTTP types in the API crate's `models.rs`.
//! Stored images are referred to by file name here; turning a file name into a `/media/...` URL is the HTTP layer's job.

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::ROLE_ADMIN;

#[derive(Debug, Clone, PartialEq)]
pub struct Ingredient {
    pub text: String,
    pub section: Option<String>,
}

/// Same shape as [`Ingredient`].
pub type Step = Ingredient;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub enum SourceType {
    #[default]
    Manual,
    Link,
    Photo,
    Text,
}

#[derive(Debug, Clone, Default)]
pub struct RecipeInput {
    pub title: String,
    pub description: String,
    pub ingredients: Vec<Ingredient>,
    pub steps: Vec<Step>,
    pub servings: Option<String>,
    pub prep_minutes: Option<i32>,
    pub cook_minutes: Option<i32>,
    pub total_minutes: Option<i32>,
    pub notes: String,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub source_type: SourceType,
    pub image_id: Option<Uuid>,
    pub photo_image_ids: Vec<Uuid>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

impl User {
    pub fn is_admin(&self) -> bool {
        self.role == ROLE_ADMIN
    }
}

/// Who made or last changed a recipe.
#[derive(Debug, Clone, PartialEq)]
pub struct UserRef {
    pub id: Uuid,
    pub display_name: String,
}

/// A live recipe as stored. Image fields are file names; the household `plate_treatment` setting is not applied
/// here (`image_display_file` is the rendition whenever one exists).
#[derive(Debug, Clone)]
pub struct Recipe {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub ingredients: Vec<Ingredient>,
    pub steps: Vec<Step>,
    pub servings: Option<String>,
    pub prep_minutes: Option<i32>,
    pub cook_minutes: Option<i32>,
    pub total_minutes: Option<i32>,
    pub notes: String,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub source_type: SourceType,
    pub image_id: Option<Uuid>,
    pub photo_image_ids: Vec<Uuid>,
    /// Sorted by name.
    pub tags: Vec<String>,
    pub image_file: Option<String>,
    pub image_display_file: Option<String>,
    /// File names of `photo_image_ids`, in the same order.
    pub photo_files: Vec<String>,
    /// `None` when the user was removed.
    pub created_by: Option<UserRef>,
    pub updated_by: Option<UserRef>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// One row of a recipe list.
#[derive(Debug, Clone)]
pub struct RecipeSummary {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub total_minutes: Option<i32>,
    /// Sorted by name.
    pub tags: Vec<String>,
    pub image_file: Option<String>,
    pub image_display_file: Option<String>,
    pub source_type: SourceType,
    pub updated_at: DateTime<Utc>,
}

/// What an import returns; never saved by the import itself.
#[derive(Debug, Clone, Default)]
pub struct RecipeDraft {
    pub title: String,
    pub description: String,
    pub ingredients: Vec<Ingredient>,
    pub steps: Vec<Step>,
    pub servings: Option<String>,
    pub prep_minutes: Option<i32>,
    pub cook_minutes: Option<i32>,
    pub total_minutes: Option<i32>,
    pub notes: String,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub source_type: SourceType,
    pub image_id: Option<Uuid>,
    pub photo_image_ids: Vec<Uuid>,
    pub tags: Vec<String>,
    /// A remote address before the image is stored, the stored file's address after.
    pub image_url: Option<String>,
    pub warnings: Vec<String>,
    pub duplicate_of: Option<Uuid>,
}

/// A stored image: the original and, once made, its print-style rendition.
#[derive(Debug, Clone)]
pub struct Image {
    pub id: Uuid,
    pub file_name: String,
    pub display_file_name: Option<String>,
    pub width: i32,
    pub height: i32,
    pub bytes: i32,
    pub created_by: Option<Uuid>,
}

/// What a photo is a photo of.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhotoMode {
    /// A written or printed recipe.
    Recipe,
    /// The finished dish; the recipe is a guess.
    Dish,
}

#[derive(Debug, Clone)]
pub struct NewUser {
    pub username: String,
    pub display_name: String,
    /// A PHC string from the password hasher.
    pub password_hash: String,
    pub role: String,
}

/// A tag and the number of live recipes that use it.
#[derive(Debug, Clone, PartialEq)]
pub struct TagCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Settings {
    /// Show recipe photos with the print treatment.
    pub plate_treatment: bool,
}

/// Order of search results.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub enum Sort {
    /// Best match first when there is search text, otherwise [`Sort::Newest`].
    #[default]
    Default,
    Newest,
    /// By title, case-insensitive.
    Title,
    /// Quickest first (`total_minutes`), recipes without a time last.
    Time,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SearchQuery {
    pub text: Option<String>,
    /// Exact tag name, case-insensitive.
    pub tag: Option<String>,
    pub sort: Sort,
    pub limit: i64,
    pub offset: i64,
}

impl Default for SearchQuery {
    fn default() -> Self {
        Self {
            text: None,
            tag: None,
            sort: Sort::Default,
            limit: 50,
            offset: 0,
        }
    }
}

impl SearchQuery {
    /// Drops NUL bytes (databases cannot store them), trims, lower-cases the tag, and turns blanks into `None`.
    pub fn normalized(self) -> Self {
        let clean =
            |s: String| Some(s.replace('\0', "").trim().to_string()).filter(|s| !s.is_empty());
        Self {
            text: self.text.and_then(clean),
            tag: self.tag.and_then(clean).map(|t| t.to_lowercase()),
            ..self
        }
    }
}

/// One page of a list; `total` counts every match, not just this page.
#[derive(Debug, Clone)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(role: &str) -> User {
        User {
            id: Uuid::nil(),
            username: "u".into(),
            display_name: "U".into(),
            role: role.into(),
            created_at: DateTime::<Utc>::UNIX_EPOCH,
        }
    }

    #[test]
    fn is_admin_only_for_admin_role() {
        assert!(user(ROLE_ADMIN).is_admin());
        assert!(!user("member").is_admin());
    }

    #[test]
    fn search_query_is_normalised() {
        let q = SearchQuery {
            text: Some("  a\0b ".into()),
            tag: Some(" DIN\0ner ".into()),
            ..Default::default()
        }
        .normalized();
        assert_eq!(q.text.as_deref(), Some("ab"));
        assert_eq!(q.tag.as_deref(), Some("dinner"));
        assert_eq!((q.sort, q.limit, q.offset), (Sort::Default, 50, 0));
        let blank = SearchQuery {
            text: Some(" \0 ".into()),
            tag: Some("".into()),
            ..Default::default()
        }
        .normalized();
        assert_eq!((blank.text, blank.tag), (None, None));
    }

    #[test]
    fn source_type_defaults_to_manual() {
        assert_eq!(SourceType::default(), SourceType::Manual);
    }
}
