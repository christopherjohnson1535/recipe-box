//! Domain types. JSON shape and OpenAPI schemas live on the HTTP types in the API crate's `models.rs`.

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
pub struct UserRef {
    pub id: Uuid,
    pub display_name: String,
}

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
    pub tags: Vec<String>,
    pub image_url: Option<String>,
    /// The print-style rendition of the main photo; none when the household setting is off or it is not made yet.
    pub image_display_url: Option<String>,
    pub photo_urls: Vec<String>,
    pub created_by: Option<UserRef>,
    pub updated_by: Option<UserRef>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct RecipeSummary {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub total_minutes: Option<i32>,
    pub tags: Vec<String>,
    pub image_url: Option<String>,
    pub image_display_url: Option<String>,
    pub image_file: Option<String>,
    pub image_display_file: Option<String>,
    pub source_type: SourceType,
    pub updated_at: DateTime<Utc>,
}

/// What an import returns; never saved by it.
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
    pub image_url: Option<String>,
    pub warnings: Vec<String>,
    pub duplicate_of: Option<Uuid>,
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

#[derive(Debug, Clone)]
pub struct Image {
    pub id: Uuid,
    pub url: String,
    /// The print-style rendition, whatever the household setting says; none if it could not be made.
    pub display_url: Option<String>,
    pub width: i32,
    pub height: i32,
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
    fn source_type_defaults_to_manual() {
        assert_eq!(SourceType::default(), SourceType::Manual);
    }
}
