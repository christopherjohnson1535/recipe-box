//! Domain types. JSON shape and OpenAPI schemas live on the HTTP types in the API crate's `models.rs`.
//! Recipe, RecipeSummary, RecipeDraft, UserRef and Image return in #88 with the ports that use them.

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

#[derive(Debug, Default)]
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
