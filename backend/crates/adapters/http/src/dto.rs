//! API types; they feed the OpenAPI spec (`docs/openapi.json`). JSON is camelCase.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, ToSchema)]
pub struct Ingredient {
    pub text: String,
    #[serde(default)]
    #[schema(required = true)]
    pub section: Option<String>,
}

/// Same shape as [`Ingredient`].
pub type Step = Ingredient;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SourceType {
    #[default]
    Manual,
    Link,
    Photo,
    Text,
}

#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct RecipeInput {
    #[schema(required = true)]
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

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserRef {
    pub id: Uuid,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub ingredients: Vec<Ingredient>,
    pub steps: Vec<Step>,
    #[schema(required = true)]
    pub servings: Option<String>,
    #[schema(required = true)]
    pub prep_minutes: Option<i32>,
    #[schema(required = true)]
    pub cook_minutes: Option<i32>,
    #[schema(required = true)]
    pub total_minutes: Option<i32>,
    pub notes: String,
    #[schema(required = true)]
    pub source_url: Option<String>,
    #[schema(required = true)]
    pub source_name: Option<String>,
    pub source_type: SourceType,
    #[schema(required = true)]
    pub image_id: Option<Uuid>,
    pub photo_image_ids: Vec<Uuid>,
    pub tags: Vec<String>,
    #[schema(required = true)]
    pub image_url: Option<String>,
    /// The print-style rendition of the main photo; null when the household setting is off or it is not made yet.
    #[schema(required = true)]
    pub image_display_url: Option<String>,
    pub photo_urls: Vec<String>,
    #[schema(required = true)]
    pub created_by: Option<UserRef>,
    #[schema(required = true)]
    pub updated_by: Option<UserRef>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    #[schema(required = true)]
    pub total_minutes: Option<i32>,
    pub tags: Vec<String>,
    #[schema(required = true)]
    pub image_url: Option<String>,
    /// As on `Recipe`.
    #[schema(required = true)]
    pub image_display_url: Option<String>,
    pub source_type: SourceType,
    pub updated_at: DateTime<Utc>,
}

/// What the import endpoints return; never saved by them. The client POSTs the reviewed draft to `/api/recipes`.
#[derive(Debug, Clone, Default, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeDraft {
    pub title: String,
    pub description: String,
    pub ingredients: Vec<Ingredient>,
    pub steps: Vec<Step>,
    #[schema(required = true)]
    pub servings: Option<String>,
    #[schema(required = true)]
    pub prep_minutes: Option<i32>,
    #[schema(required = true)]
    pub cook_minutes: Option<i32>,
    #[schema(required = true)]
    pub total_minutes: Option<i32>,
    pub notes: String,
    #[schema(required = true)]
    pub source_url: Option<String>,
    #[schema(required = true)]
    pub source_name: Option<String>,
    pub source_type: SourceType,
    #[schema(required = true)]
    pub image_id: Option<Uuid>,
    pub photo_image_ids: Vec<Uuid>,
    pub tags: Vec<String>,
    #[schema(required = true)]
    pub image_url: Option<String>,
    pub warnings: Vec<String>,
    #[schema(required = true)]
    pub duplicate_of: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    #[schema(schema_with = role_schema)]
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// `role` is a text column; the schema lists the two values the API accepts and returns.
pub fn role_schema() -> utoipa::openapi::Object {
    utoipa::openapi::Object::builder()
        .schema_type(utoipa::openapi::Type::String)
        .enum_values(Some([domain::ROLE_ADMIN, "member"]))
        .build()
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub id: Uuid,
    pub url: String,
    /// The print-style rendition, whatever the household setting says; null if it could not be made.
    #[schema(required = true)]
    pub display_url: Option<String>,
    pub width: i32,
    pub height: i32,
}

pub fn media_url(file_name: &str) -> String {
    format!("/media/{file_name}")
}

/// Raw bytes in a response (an image or a zip).
#[derive(ToSchema)]
#[schema(value_type = String, format = Binary)]
#[allow(dead_code)] // schema only
pub struct BinaryFile(Vec<u8>);

impl From<domain::User> for User {
    fn from(u: domain::User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            role: u.role,
            created_at: u.created_at,
        }
    }
}

impl From<domain::Image> for Image {
    fn from(i: domain::Image) -> Self {
        Self {
            id: i.id,
            url: media_url(&i.file_name),
            display_url: i.display_file_name.as_deref().map(media_url),
            width: i.width,
            height: i.height,
        }
    }
}

impl From<domain::Recipe> for Recipe {
    /// `image_display_file` is already hidden by the service when the household setting is off.
    fn from(r: domain::Recipe) -> Self {
        let user_ref = |u: Option<domain::UserRef>| {
            u.map(|u| UserRef {
                id: u.id,
                display_name: u.display_name,
            })
        };
        Self {
            id: r.id,
            title: r.title,
            description: r.description,
            ingredients: r.ingredients.into_iter().map(Into::into).collect(),
            steps: r.steps.into_iter().map(Into::into).collect(),
            servings: r.servings,
            prep_minutes: r.prep_minutes,
            cook_minutes: r.cook_minutes,
            total_minutes: r.total_minutes,
            notes: r.notes,
            source_url: r.source_url,
            source_name: r.source_name,
            source_type: r.source_type.into(),
            image_id: r.image_id,
            photo_image_ids: r.photo_image_ids,
            tags: r.tags,
            image_url: r.image_file.as_deref().map(media_url),
            image_display_url: r.image_display_file.as_deref().map(media_url),
            photo_urls: r.photo_files.iter().map(|f| media_url(f)).collect(),
            created_by: user_ref(r.created_by),
            updated_by: user_ref(r.updated_by),
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

impl From<domain::RecipeSummary> for RecipeSummary {
    fn from(r: domain::RecipeSummary) -> Self {
        Self {
            id: r.id,
            title: r.title,
            description: r.description,
            total_minutes: r.total_minutes,
            tags: r.tags,
            image_url: r.image_file.as_deref().map(media_url),
            image_display_url: r.image_display_file.as_deref().map(media_url),
            source_type: r.source_type.into(),
            updated_at: r.updated_at,
        }
    }
}

// Conversions to and from the domain types. The DTOs carry `ToSchema` (the domain has no OpenAPI dependency), so
// they stay separate types; the mapping lives here and nowhere else. `Ingredient`, `SourceType` and `RecipeDraft`
// are also what the import code builds, until the import ports (#92) move that behind the domain types.

impl From<Ingredient> for domain::Ingredient {
    fn from(i: Ingredient) -> Self {
        Self {
            text: i.text,
            section: i.section,
        }
    }
}

impl From<domain::Ingredient> for Ingredient {
    fn from(i: domain::Ingredient) -> Self {
        Self {
            text: i.text,
            section: i.section,
        }
    }
}

impl From<SourceType> for domain::SourceType {
    fn from(s: SourceType) -> Self {
        match s {
            SourceType::Manual => Self::Manual,
            SourceType::Link => Self::Link,
            SourceType::Photo => Self::Photo,
            SourceType::Text => Self::Text,
        }
    }
}

impl From<domain::SourceType> for SourceType {
    fn from(s: domain::SourceType) -> Self {
        match s {
            domain::SourceType::Manual => Self::Manual,
            domain::SourceType::Link => Self::Link,
            domain::SourceType::Photo => Self::Photo,
            domain::SourceType::Text => Self::Text,
        }
    }
}

impl From<RecipeInput> for domain::RecipeInput {
    fn from(r: RecipeInput) -> Self {
        Self {
            title: r.title,
            description: r.description,
            ingredients: r.ingredients.into_iter().map(Into::into).collect(),
            steps: r.steps.into_iter().map(Into::into).collect(),
            servings: r.servings,
            prep_minutes: r.prep_minutes,
            cook_minutes: r.cook_minutes,
            total_minutes: r.total_minutes,
            notes: r.notes,
            source_url: r.source_url,
            source_name: r.source_name,
            source_type: r.source_type.into(),
            image_id: r.image_id,
            photo_image_ids: r.photo_image_ids,
            tags: r.tags,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_type_round_trips() {
        for (api, dom) in [
            (SourceType::Manual, domain::SourceType::Manual),
            (SourceType::Link, domain::SourceType::Link),
            (SourceType::Photo, domain::SourceType::Photo),
            (SourceType::Text, domain::SourceType::Text),
        ] {
            assert_eq!(domain::SourceType::from(api), dom);
            assert_eq!(SourceType::from(dom), api);
        }
    }

    #[test]
    fn ingredient_round_trips() {
        let api = Ingredient {
            text: "flour".into(),
            section: Some("dough".into()),
        };
        let dom = domain::Ingredient::from(api.clone());
        assert_eq!(dom.text, "flour");
        assert_eq!(dom.section.as_deref(), Some("dough"));
        assert_eq!(Ingredient::from(dom), api);
    }

    #[test]
    fn recipe_input_maps_every_field() {
        let id = Uuid::new_v4();
        let api = RecipeInput {
            title: "Soup".into(),
            description: "d".into(),
            ingredients: vec![Ingredient {
                text: "a".into(),
                section: None,
            }],
            steps: vec![Ingredient {
                text: "b".into(),
                section: Some("s".into()),
            }],
            servings: Some("4".into()),
            prep_minutes: Some(1),
            cook_minutes: Some(2),
            total_minutes: Some(3),
            notes: "n".into(),
            source_url: Some("https://x.test".into()),
            source_name: Some("X".into()),
            source_type: SourceType::Link,
            image_id: Some(id),
            photo_image_ids: vec![id],
            tags: vec!["t".into()],
        };
        let dom = domain::RecipeInput::from(api.clone());
        assert_eq!(dom.title, "Soup");
        assert_eq!(dom.source_type, domain::SourceType::Link);
        assert_eq!(dom.photo_image_ids, vec![id]);
        assert_eq!(dom.ingredients[0].text, "a");
        assert_eq!(dom.steps[0].section.as_deref(), Some("s"));
        assert_eq!(dom.image_id, Some(id));
        assert_eq!(dom.total_minutes, Some(3));
        assert_eq!(dom.tags, api.tags);
    }
}
