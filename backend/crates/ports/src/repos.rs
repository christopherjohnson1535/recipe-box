//! Storage ports. Each method is atomic: it either does everything it says or leaves nothing behind.

use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use domain::{
    DomainResult, Image, Ingredient, NewUser, Page, Recipe, RecipeInput, RecipeSummary,
    SearchQuery, Settings, TagCount, User,
    chrono::{DateTime, Utc},
    grocery::{Amount, GeneratedItem, Section},
    uuid::Uuid,
};

/// Recipes with their tags and photo links. Soft-deleted recipes are invisible to everything except
/// [`RecipeRepo::restore`] and [`RecipeRepo::purge_deleted_before`].
///
/// A repository is built with a [`crate::Clock`] and stamps `created_at`, `updated_at` and the delete time with it.
/// Inputs are already validated and normalised (`domain::validate::recipe`); tags arrive lower-case.
#[async_trait]
pub trait RecipeRepo: Send + Sync {
    /// Saves a new recipe with its tags and photo links as one unit and returns it. `user_id` is the creator.
    /// `Validation` when `image_id` or a photo id names no image; nothing is saved then.
    async fn create(&self, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe>;

    /// Saves all of `inputs` as new recipes in one unit (all or nothing) and returns their new ids in order. Same
    /// rules as [`RecipeRepo::create`] for each; if any fails, nothing at all is saved, not even a deleted row.
    async fn create_many(&self, user_id: Uuid, inputs: Vec<RecipeInput>)
    -> DomainResult<Vec<Uuid>>;

    /// A live recipe, or `None` when there is none (never existed, deleted, purged). Image fields are file names
    /// as stored: the household `plate_treatment` setting that decides whether `image_display_file` is shown is
    /// applied by the service, not here.
    async fn get(&self, id: Uuid) -> DomainResult<Option<Recipe>>;

    /// Replaces every field, the tags and the photo links of a live recipe as one unit (a full replace, not a
    /// patch) and returns it. `user_id` becomes `updated_by`. `NotFound` for a missing or deleted recipe,
    /// `Validation` for an unknown image; nothing is changed in either case.
    async fn update(&self, id: Uuid, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe>;

    /// Soft delete: the recipe disappears from `get` and `search` and keeps its row, stamped with the clock's now.
    /// `NotFound` for a missing or already deleted recipe.
    async fn soft_delete(&self, id: Uuid) -> DomainResult<()>;

    /// Undoes a delete made less than [`domain::RESTORE_WINDOW_MINUTES`] ago (the clock's now minus the delete
    /// time; exactly the window is too late). `NotFound` when there is no such row, `Conflict` when it was deleted
    /// too long ago. Restoring a recipe that is not deleted does nothing and returns it.
    async fn restore(&self, id: Uuid) -> DomainResult<Recipe>;

    /// Hard-deletes recipes soft-deleted strictly before `cutoff` (the caller passes now minus
    /// [`domain::PURGE_AFTER`]), with their tag and photo links. Returns how many were removed.
    async fn purge_deleted_before(&self, cutoff: DateTime<Utc>) -> DomainResult<u64>;

    /// Live recipes matching `query`, one page, with `total` counting all matches. Summaries carry the stored
    /// image file names; the household `plate_treatment` setting that gates `image_display_file` is applied by the
    /// service, not here. `query` is normalised first
    /// ([`SearchQuery::normalized`]: NUL bytes dropped, blanks mean no filter, the tag lower-cased). What counts as
    /// a match, from the product point of view (the storage engine decides how):
    ///
    /// - **Searched text** is the title, description, notes and ingredient lines (not steps). Matching ignores
    ///   case and punctuation and works on whole words, so `buttermilk` finds an ingredient line but not `butter`.
    /// - **Web-search syntax**: words are ANDed; `"two words"` is a phrase (the words next to each other, in
    ///   order); `-word` excludes recipes containing it; `a or b` matches either.
    /// - **A half-typed last word** matches: `weeknight lasag` finds "Weeknight lasagne" (all earlier words whole,
    ///   the last as a prefix). Not when the text uses quotes, `-` or `or`, which keep their meaning.
    /// - **Title prefix**: the whole text, as typed, matches a title that starts with it (`Apple C` finds "Apple
    ///   crumble"), whatever the words.
    /// - **Tag names**: the whole text matches a tag name that starts with it (`din` finds recipes tagged `dinner`).
    ///   Words are not combined across fields: `weeknight lasag` finds nothing when `weeknight` is only a tag.
    /// - **Literal characters**: `%` and `_` (and quotes, backslashes, SQL) are ordinary characters, never
    ///   wildcards, and never an error. Text with no usable word matches nothing (it is not "everything").
    /// - **`tag`** keeps only recipes carrying that exact tag name (any case), combined with the text by AND.
    ///
    /// Order, with `Sort::Default` and text: recipes whose title starts with the text first, then better
    /// relevance (the adapter's measure of how often the words occur), then newest first, then id. Without text,
    /// `Default` is newest first. `Newest` is `created_at` descending, `Title` is the lower-cased title, `Time` is
    /// `total_minutes` ascending with unknown times last; each ends by title (`Time`) and id so the order is
    /// total. An explicit sort beats relevance. `offset` and `limit` page the ordered list.
    async fn search(&self, query: SearchQuery) -> DomainResult<Page<RecipeSummary>>;

    /// `(id, source_url)` of live recipes whose `source_url` contains any of `hosts`, ignoring case, oldest
    /// first (`created_at`, then id). It is the prefilter for the duplicate-import check (LNK-5): the caller
    /// compares the normalised URLs itself. Recipes with no `source_url` and deleted ones never appear; an
    /// empty `hosts` gives an empty list. A host is plain text, never a pattern (`%` and `_` are ordinary).
    async fn live_source_urls(&self, hosts: &[String]) -> DomainResult<Vec<(Uuid, String)>>;
}

/// Image rows: the metadata of files held by the [`crate::MediaStore`]. Recipes link to them by id.
#[async_trait]
pub trait ImageRepo: Send + Sync {
    /// Records a stored image. A recipe can link to it from now on.
    async fn add(&self, image: Image) -> DomainResult<()>;

    /// Deletes images (cleanup after a failed request). Recipes that used one as the main image lose that
    /// image; photo links to it are dropped. Unknown ids are ignored.
    async fn delete(&self, ids: &[Uuid]) -> DomainResult<()>;

    /// Records the rendition of an image, only if it has none yet. `false` when the image is gone or already has
    /// one; the caller then removes the file it just wrote.
    async fn set_display_file(&self, id: Uuid, file_name: &str) -> DomainResult<bool>;

    /// Ids of images that still need a rendition.
    async fn without_display_file(&self) -> DomainResult<Vec<Uuid>>;
}

/// Household members and their password hashes.
#[async_trait]
pub trait UserRepo: Send + Sync {
    /// Whether any user exists (the first-run check).
    async fn any(&self) -> DomainResult<bool>;

    /// Creates a user. `Conflict` when the username is taken (names compare case-insensitively).
    async fn create(&self, new: NewUser) -> DomainResult<User>;

    /// Creates the first user, only while there are none: of two concurrent calls exactly one succeeds. `Forbidden`
    /// when a user already exists.
    async fn create_first_admin(&self, new: NewUser) -> DomainResult<User>;

    /// Everyone, ordered by lower-cased display name, then username.
    async fn list(&self) -> DomainResult<Vec<User>>;

    /// The user with that username (case-insensitive) and their password hash, for sign-in.
    async fn find_with_hash(&self, username: &str) -> DomainResult<Option<(User, String)>>;

    /// A user's password hash, or `None` when there is no such user.
    async fn password_hash(&self, id: Uuid) -> DomainResult<Option<String>>;

    /// Compare-and-set: sets the password hash and ends the user's sessions, except the one whose token hash is
    /// `keep_session`, as one unit. With `expected` of `Some(h)` the change happens only if the stored hash is
    /// still `h` (the hash the caller verified the current password against); if it changed in between, nothing
    /// is changed and the result is `Conflict`, so of two concurrent changes exactly one wins. `None` skips the
    /// check (an admin resetting someone's password). `NotFound` when there is no such user.
    async fn set_password_hash(
        &self,
        id: Uuid,
        hash: &str,
        expected: Option<&str>,
        keep_session: Option<&[u8]>,
    ) -> DomainResult<()>;

    /// Removes a user. Their sessions go with them; recipes and images they made stay, with the creator cleared.
    /// `NotFound` when there is no such user, `Forbidden` when it is the last admin (two concurrent removals
    /// cannot both pass this check).
    async fn remove(&self, id: Uuid) -> DomainResult<()>;
}

/// Sign-in sessions. Only the SHA-256 of the cookie token is stored (`token_hash`).
#[async_trait]
pub trait SessionRepo: Send + Sync {
    /// Starts a session for an existing user, valid until `expires_at`. `NotFound` when there is no such user,
    /// `Conflict` when `token_hash` already belongs to a session (the existing one is left as it was).
    async fn create(
        &self,
        user_id: Uuid,
        token_hash: Vec<u8>,
        expires_at: DateTime<Utc>,
    ) -> DomainResult<()>;

    /// The user behind a session that has not expired (expired means `expires_at` is not after the clock's now).
    async fn user_for_token(&self, token_hash: &[u8]) -> DomainResult<Option<User>>;

    /// Ends one session. A session that does not exist is not an error.
    async fn delete(&self, token_hash: &[u8]) -> DomainResult<()>;

    /// Removes sessions whose `expires_at` is strictly before the clock's now; returns how many.
    async fn purge_expired(&self) -> DomainResult<u64>;
}

/// The household settings (one record). A new store starts with `plate_treatment` on.
#[async_trait]
pub trait SettingsRepo: Send + Sync {
    async fn get(&self) -> DomainResult<Settings>;

    /// Replaces the settings and returns them.
    async fn set(&self, settings: Settings) -> DomainResult<Settings>;
}

/// Tags, which exist only through the recipes that carry them.
#[async_trait]
pub trait TagRepo: Send + Sync {
    /// Tags carried by at least one live recipe, with how many, ordered by name.
    async fn list_in_use(&self) -> DomainResult<Vec<TagCount>>;
}

/// A liveness probe of the storage behind the other repositories (the health check).
#[async_trait]
pub trait StorageHealth: Send + Sync {
    /// Succeeds when the storage answers a trivial query; `Internal` when it does not.
    async fn ping(&self) -> DomainResult<()>;
}

/// The household's one active grocery list.
#[derive(Debug, Clone, PartialEq)]
pub struct GroceryList {
    pub id: Uuid,
    /// The clock's now at the last write; every write moves it.
    pub updated_at: DateTime<Utc>,
}

/// A live recipe on the list, with what a recompute needs from it.
#[derive(Debug, Clone, PartialEq)]
pub struct ListedRecipe {
    pub recipe_id: Uuid,
    pub scale: f64,
    pub title: String,
    pub servings: Option<String>,
    /// The main photo's file name as stored (the household `plate_treatment` setting is not applied).
    pub image_file: Option<String>,
    pub ingredients: Vec<Ingredient>,
}

/// One visible item of the list. `key` is the merge key (generated items: unique among them; a manual item's key is
/// that of its name, shared with any generated item of that name).
#[derive(Debug, Clone, PartialEq)]
pub struct GroceryItem {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub amounts: Vec<Amount>,
    pub section: Section,
    pub checked: bool,
    pub manual: bool,
    pub recipe_ids: Vec<Uuid>,
}

impl GroceryItem {
    /// `amounts` without any that holds a NaN or an infinity (an amount nobody can shop for). Storage must never
    /// write one: it would not read back.
    pub fn finite_amounts(amounts: Vec<Amount>) -> Vec<Amount> {
        amounts
            .into_iter()
            .filter(|a| a.min.is_finite() && a.max.is_none_or(f64::is_finite))
            .collect()
    }

    /// Whether two amount lists mean the same, whatever their order: each amount has a partner with the same unit
    /// and quantities that agree to far more digits than anyone shops with (amounts go through `jsonb` and back,
    /// which may move the last digit of a float).
    pub fn same_amounts(a: &[Amount], b: &[Amount]) -> bool {
        let close = |x: f64, y: f64| (x - y).abs() <= 1e-9 * x.abs().max(y.abs());
        let same = |x: &Amount, y: &Amount| {
            x.unit == y.unit
                && close(x.min, y.min)
                && match (x.max, y.max) {
                    (None, None) => true,
                    (Some(p), Some(q)) => close(p, q),
                    _ => false,
                }
        };
        let mut left: Vec<&Amount> = b.iter().collect();
        a.len() == b.len()
            && a.iter()
                .all(|x| match left.iter().position(|y| same(x, y)) {
                    Some(i) => {
                        left.swap_remove(i);
                        true
                    }
                    None => false,
                })
    }
}

/// A manual item to add; already parsed by the service.
#[derive(Debug, Clone, PartialEq)]
pub struct NewGroceryItem {
    pub key: String,
    pub name: String,
    pub amounts: Vec<Amount>,
    pub section: Section,
}

/// What [`GroceryRepo::recompute`] runs under the list lock: the list's live recipes and the section overrides in,
/// the full set of generated items out. Pure and quick (it runs while the list is locked).
pub type Compute =
    dyn Fn(&[ListedRecipe], &HashMap<String, Section>) -> Vec<GeneratedItem> + Send + Sync;

/// The grocery list (GRO), its section overrides and its staples. Storage only: what to put on the list is decided
/// by `domain::grocery` and the service. There is one list; `get_or_create_list` makes it on first use and every
/// other method takes its id. Every method that changes the list sets its `updated_at` to the clock's now.
///
/// A **cleared** item is one the household crossed off for good (a ticked item cleared, or a generated item
/// removed): it stays stored, hidden from every method below, so a recompute does not bring it back until its
/// amounts change. A manual item is deleted instead of cleared.
#[async_trait]
pub trait GroceryRepo: Send + Sync {
    /// The list, created empty on first use. Two concurrent first calls get the same list.
    async fn get_or_create_list(&self) -> DomainResult<GroceryList>;

    /// The list's recipes that are live (soft-deleted and purged ones are not listed; a recipe restored within the
    /// window is back, with its scale), in the order they were put on the list, then by id.
    async fn recipes(&self, list_id: Uuid) -> DomainResult<Vec<ListedRecipe>>;

    /// The visible (not cleared) items, in no particular order.
    async fn items(&self, list_id: Uuid) -> DomainResult<Vec<GroceryItem>>;

    /// A visible item, or `None`.
    async fn item(&self, id: Uuid) -> DomainResult<Option<GroceryItem>>;

    /// Puts a live recipe on the list at `scale`, or sets the scale of one already there. `NotFound` when the
    /// recipe is missing or deleted. Does not touch the items: run [`GroceryRepo::recompute`] after.
    ///
    /// **Locking.** Every method that changes the list first takes the list's lock (one writer at a time), so the
    /// order they are called in is the order they take effect, and no two of them can wait on each other.
    async fn add_recipe(&self, list_id: Uuid, recipe_id: Uuid, scale: f64) -> DomainResult<()>;

    /// Takes a recipe off the list. `NotFound` when it is not on it (a deleted recipe still on the list can be
    /// removed). Does not touch the items.
    async fn remove_recipe(&self, list_id: Uuid, recipe_id: Uuid) -> DomainResult<()>;

    /// Makes the generated (non-manual) items equal to `compute(recipes, overrides)`, all in one unit while the list
    /// is locked, so two concurrent calls run one after the other and each sees every recipe already saved. Per
    /// computed key: no such item yet, add it; an item of that key (even a cleared one) is updated to the computed
    /// name, amounts, section and recipes, and when the **amounts** differ it is also un-ticked and un-cleared
    /// (you need more); items whose key is no longer computed are deleted. Manual items are never touched. Nothing
    /// is written, and `updated_at` does not move, when the result equals what is stored (amounts are compared with
    /// [`GroceryItem::same_amounts`]). An amount that is not finite is stored as no amount, and a stored amount that
    /// cannot be read back is read as none.
    async fn recompute(&self, list_id: Uuid, compute: &Compute) -> DomainResult<()>;

    /// Adds a manual item. A manual item never merges with another. Amounts that are not finite are dropped.
    async fn add_manual(&self, list_id: Uuid, item: NewGroceryItem) -> DomainResult<GroceryItem>;

    /// Applies one PATCH of a visible item in one unit (all or nothing) and returns the item as it is after.
    /// `checked` ticks or unticks it. `section` is remembered as the household's choice for the item's key and
    /// moves every item of that key (manual or generated) there. `staple` marks or unmarks the key. `NotFound` for
    /// an unknown or cleared item; nothing is changed then.
    async fn update_item(
        &self,
        id: Uuid,
        checked: Option<bool>,
        section: Option<Section>,
        staple: Option<bool>,
    ) -> DomainResult<GroceryItem>;

    /// Removes a visible item from the list: a manual one is deleted, a generated one cleared. `NotFound` for an
    /// unknown or cleared one.
    async fn clear_item(&self, id: Uuid) -> DomainResult<()>;

    /// [`GroceryRepo::clear_item`] for every ticked item.
    async fn clear_checked(&self, list_id: Uuid) -> DomainResult<()>;

    /// Removes every recipe and every item (cleared ones too). Overrides and staples stay.
    async fn clear_all(&self, list_id: Uuid) -> DomainResult<()>;

    /// The household's section choices by merge key.
    async fn overrides(&self) -> DomainResult<HashMap<String, Section>>;

    /// Merge keys of the household's staples ("always have it"). A new store starts with salt, black pepper, pepper
    /// and water.
    async fn staples(&self) -> DomainResult<HashSet<String>>;
}

/// A member's link to their Google account.
#[derive(Debug, Clone, PartialEq)]
pub struct GoogleConnection {
    /// The refresh token as sealed by a [`crate::TokenCipher`]; storage never sees it in the clear.
    pub sealed_token: Vec<u8>,
    /// The Google Tasks list the grocery list was last sent to.
    pub tasklist_id: Option<String>,
    pub connected_at: DateTime<Utc>,
}

/// At most one Google connection per user. A user's connection goes when the user does.
#[async_trait]
pub trait GoogleConnectionRepo: Send + Sync {
    async fn get(&self, user_id: Uuid) -> DomainResult<Option<GoogleConnection>>;

    /// Stores the token and `connected_at`, replacing an earlier connection's token; the remembered task list
    /// stays (a list of another account is simply not found at Google). `NotFound` when there is no such user.
    async fn upsert(
        &self,
        user_id: Uuid,
        sealed_token: Vec<u8>,
        connected_at: DateTime<Utc>,
    ) -> DomainResult<()>;

    /// Remembers the task list. Does nothing when the user has no connection.
    async fn set_tasklist(&self, user_id: Uuid, tasklist_id: &str) -> DomainResult<()>;

    /// Forgets the connection and its task list. Not an error when there is none.
    async fn delete(&self, user_id: Uuid) -> DomainResult<()>;
}
