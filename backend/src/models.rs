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

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, sqlx::Type, ToSchema)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text", rename_all = "lowercase")]
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
    pub photo_urls: Vec<String>,
    #[schema(required = true)]
    pub created_by: Option<UserRef>,
    #[schema(required = true)]
    pub updated_by: Option<UserRef>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    #[schema(required = true)]
    pub total_minutes: Option<i32>,
    pub tags: Vec<String>,
    #[sqlx(skip)]
    #[schema(required = true)]
    pub image_url: Option<String>,
    #[serde(skip)]
    pub image_file: Option<String>,
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

#[derive(Debug, Clone, Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    #[schema(schema_with = role_schema)]
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// Select list for [`User`] as a literal for `concat!`; `username` is citext, so it is cast for decoding.
#[macro_export]
macro_rules! user_columns {
    () => {
        "id, username::text as username, display_name, role, created_at"
    };
}

/// `role` is a text column; the schema lists the two values the API accepts and returns.
pub fn role_schema() -> utoipa::openapi::Object {
    utoipa::openapi::Object::builder()
        .schema_type(utoipa::openapi::Type::String)
        .enum_values(Some(["admin", "member"]))
        .build()
}

impl User {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub id: Uuid,
    pub url: String,
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
