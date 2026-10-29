//! API types; they feed the OpenAPI spec (`docs/openapi.json`). JSON is camelCase.

use chrono::{DateTime, NaiveDate, Utc};
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
#[schema(example = json!({
    "title": "Pancakes",
    "description": "Fluffy weekend pancakes.",
    "ingredients": [{"text": "2 cups flour", "section": null}, {"text": "2 eggs", "section": null}],
    "steps": [{"text": "Mix the batter.", "section": null}, {"text": "Fry until golden.", "section": null}],
    "servings": "4",
    "prepMinutes": 10,
    "cookMinutes": 15,
    "totalMinutes": 25,
    "notes": "",
    "sourceUrl": null,
    "sourceName": null,
    "sourceType": "manual",
    "imageId": null,
    "photoImageIds": [],
    "tags": ["breakfast"]
}))]
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
    /// Whether the signed-in member starred it. Each member has their own favourites.
    pub is_favourite: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    #[schema(required = true)]
    pub total_minutes: Option<i32>,
    /// Free text, as on `Recipe`.
    #[schema(required = true)]
    pub servings: Option<String>,
    pub tags: Vec<String>,
    #[schema(required = true)]
    pub image_url: Option<String>,
    /// As on `Recipe`.
    #[schema(required = true)]
    pub image_display_url: Option<String>,
    pub source_type: SourceType,
    pub updated_at: DateTime<Utc>,
    /// As on `Recipe`.
    pub is_favourite: bool,
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
    /// The Google address that may sign in as this member; null when none is set.
    #[schema(required = true)]
    pub email: Option<String>,
    #[schema(schema_with = role_schema)]
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// Which ways to sign in this server offers besides the password.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AuthProviders {
    /// Sign in with Google is set up (the Google OAuth client is configured).
    pub google: bool,
}

/// A Google account linked to the signed-in member.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub id: Uuid,
    #[schema(schema_with = provider_schema)]
    pub provider: String,
    /// The account's address when it was linked.
    pub email: String,
    pub created_at: DateTime<Utc>,
}

/// `provider` is a text column; Google is the only provider so far.
pub fn provider_schema() -> utoipa::openapi::Object {
    utoipa::openapi::Object::builder()
        .schema_type(utoipa::openapi::Type::String)
        .enum_values(Some([domain::PROVIDER_GOOGLE]))
        .build()
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

/// A store section, in shopping order.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum GrocerySection {
    Produce,
    Meat,
    Fridge,
    Freezer,
    Pantry,
    Other,
}

/// One amount of a grocery item: `quantity` as a cook writes it (`1½`, `2–3`), `unit` in its short form.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct GroceryAmount {
    #[schema(required = true)]
    pub quantity: Option<String>,
    #[schema(required = true)]
    pub unit: Option<String>,
}

/// Several amounts mean different units side by side; none means "no amount".
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GroceryItem {
    pub id: Uuid,
    pub name: String,
    pub amounts: Vec<GroceryAmount>,
    pub section: GrocerySection,
    pub checked: bool,
    /// Added by hand rather than made from a recipe.
    pub manual: bool,
    /// Always has it at home: shown, but the client hides it unless asked.
    pub staple: bool,
    pub recipe_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GroceryRecipe {
    pub recipe_id: Uuid,
    pub title: String,
    /// The factor the recipe page uses (½× is 0.5).
    pub scale: f64,
    /// The recipe's servings text scaled by `scale` (`"4-6"` at 0.5 is `"2–3"`).
    #[schema(required = true)]
    pub servings: Option<String>,
    #[schema(required = true)]
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GroceryList {
    pub id: Uuid,
    /// Changes on every write: refetch when it differs from what you hold.
    pub updated_at: DateTime<Utc>,
    pub recipes: Vec<GroceryRecipe>,
    /// By section in shopping order, then by name. Cleared items are not returned.
    pub items: Vec<GroceryItem>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddGroceryRecipe {
    pub recipe_id: Uuid,
    /// 0.25 to 10; default 1. Setting it for a recipe already on the list rescales it.
    #[schema(minimum = 0.25, maximum = 10.0, default = 1.0)]
    pub scale: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddGroceryItem {
    /// Read like an ingredient line ("2 lb potatoes"); 1 to 200 characters once trimmed.
    pub text: String,
    /// Without it the section is the household's choice for the name, else a built-in guess.
    pub section: Option<GrocerySection>,
}

/// At least one field.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateGroceryItem {
    pub checked: Option<bool>,
    /// Also remembered for the item's name, so the next list files it there.
    pub section: Option<GrocerySection>,
    pub staple: Option<bool>,
}

/// One "made it" entry: who cooked the recipe, on which day, and what they would change.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CookLogEntry {
    pub id: Uuid,
    pub recipe_id: Uuid,
    /// The cook's own calendar day (`YYYY-MM-DD`).
    pub cooked_on: NaiveDate,
    /// What they would change next time; empty when they left no note.
    pub note: String,
    /// `null` once that member was removed.
    #[schema(required = true)]
    pub made_by: Option<UserRef>,
    pub created_at: DateTime<Utc>,
}

impl From<domain::CookLogEntry> for CookLogEntry {
    fn from(e: domain::CookLogEntry) -> Self {
        Self {
            id: e.id,
            recipe_id: e.recipe_id,
            cooked_on: e.cooked_on,
            note: e.note,
            made_by: e.made_by.map(|u| UserRef {
                id: u.id,
                display_name: u.display_name,
            }),
            created_at: e.created_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewCookLogEntry {
    /// The cook's own calendar day (`YYYY-MM-DD`); not in the future.
    pub cooked_on: NaiveDate,
    /// What they would change next time; at most 2,000 characters once trimmed. Default empty.
    #[serde(default)]
    #[schema(max_length = 2000)]
    pub note: String,
}

/// Whether this member can send the grocery list to Google Tasks.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// The server has a Google OAuth client. When false, nothing else here works and `connected` is false.
    pub configured: bool,
    /// This member connected their Google account.
    pub connected: bool,
    #[schema(required = true)]
    pub connected_at: Option<DateTime<Utc>>,
}

impl From<app::GoogleStatus> for GoogleStatus {
    fn from(s: app::GoogleStatus) -> Self {
        Self {
            configured: s.configured,
            connected: s.connected,
            connected_at: s.connected_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GoogleExportRequest {
    /// Also send items marked as staples (default false).
    pub include_staples: Option<bool>,
}

/// What was sent to Google Tasks.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GoogleExport {
    /// The Google Tasks list used (`Groceries`).
    pub task_list_title: String,
    /// Parent tasks: the store sections that had something to buy.
    pub sections: usize,
    /// Subtasks: the items beneath them.
    pub items: usize,
}

impl From<app::GoogleExport> for GoogleExport {
    fn from(e: app::GoogleExport) -> Self {
        Self {
            task_list_title: e.task_list_title,
            sections: e.sections,
            items: e.items,
        }
    }
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
            email: u.email,
            role: u.role,
            created_at: u.created_at,
        }
    }
}

impl From<domain::Identity> for Identity {
    fn from(i: domain::Identity) -> Self {
        Self {
            id: i.id,
            provider: i.provider,
            email: i.email,
            created_at: i.created_at,
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
            is_favourite: r.is_favourite,
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
            servings: r.servings,
            tags: r.tags,
            image_url: r.image_file.as_deref().map(media_url),
            image_display_url: r.image_display_file.as_deref().map(media_url),
            source_type: r.source_type.into(),
            updated_at: r.updated_at,
            is_favourite: r.is_favourite,
        }
    }
}

impl From<GrocerySection> for domain::grocery::Section {
    fn from(s: GrocerySection) -> Self {
        match s {
            GrocerySection::Produce => Self::Produce,
            GrocerySection::Meat => Self::Meat,
            GrocerySection::Fridge => Self::Fridge,
            GrocerySection::Freezer => Self::Freezer,
            GrocerySection::Pantry => Self::Pantry,
            GrocerySection::Other => Self::Other,
        }
    }
}

impl From<domain::grocery::Section> for GrocerySection {
    fn from(s: domain::grocery::Section) -> Self {
        use domain::grocery::Section as S;
        match s {
            S::Produce => Self::Produce,
            S::Meat => Self::Meat,
            S::Fridge => Self::Fridge,
            S::Freezer => Self::Freezer,
            S::Pantry => Self::Pantry,
            S::Other => Self::Other,
        }
    }
}

impl From<app::GroceryItemView> for GroceryItem {
    fn from(v: app::GroceryItemView) -> Self {
        let i = v.item;
        Self {
            id: i.id,
            name: i.name,
            amounts: i
                .amounts
                .iter()
                .map(|a| GroceryAmount {
                    quantity: Some(domain::grocery::format_amount_quantity(a)),
                    unit: a.unit.clone(),
                })
                .collect(),
            section: i.section.into(),
            checked: i.checked,
            manual: i.manual,
            staple: v.staple,
            recipe_ids: i.recipe_ids,
        }
    }
}

impl From<app::GroceryListView> for GroceryList {
    fn from(v: app::GroceryListView) -> Self {
        Self {
            id: v.id,
            updated_at: v.updated_at,
            recipes: v
                .recipes
                .into_iter()
                .map(|r| GroceryRecipe {
                    recipe_id: r.recipe_id,
                    title: r.title,
                    scale: r.scale,
                    servings: r.servings,
                    image_url: r.image_file.as_deref().map(media_url),
                })
                .collect(),
            items: v.items.into_iter().map(Into::into).collect(),
        }
    }
}

// Conversions to and from the domain types. The DTOs carry `ToSchema` (the domain has no OpenAPI dependency), so
// they stay separate types; the mapping lives here and nowhere else.

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

impl From<domain::RecipeDraft> for RecipeDraft {
    fn from(d: domain::RecipeDraft) -> Self {
        Self {
            title: d.title,
            description: d.description,
            ingredients: d.ingredients.into_iter().map(Into::into).collect(),
            steps: d.steps.into_iter().map(Into::into).collect(),
            servings: d.servings,
            prep_minutes: d.prep_minutes,
            cook_minutes: d.cook_minutes,
            total_minutes: d.total_minutes,
            notes: d.notes,
            source_url: d.source_url,
            source_name: d.source_name,
            source_type: d.source_type.into(),
            image_id: d.image_id,
            photo_image_ids: d.photo_image_ids,
            tags: d.tags,
            image_url: d.image_url,
            warnings: d.warnings,
            duplicate_of: d.duplicate_of,
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
