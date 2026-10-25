//! In-memory implementations of the ports, for service tests and as the reference the storage contract suite is
//! checked against. State lives in plain maps behind one mutex; nothing is persisted.

mod search;

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
};

use async_trait::async_trait;
use domain::{
    DomainError, DomainResult, Image, NewUser, Page, RESTORE_WINDOW_MINUTES, ROLE_ADMIN, Recipe,
    RecipeInput, RecipeSummary, SearchQuery, Settings, Sort, TagCount, User, UserRef,
    chrono::{DateTime, Duration, Utc},
    grocery::Section,
    uuid::Uuid,
};
use ports::{
    Clock, Compute, EncodedImage, GroceryItem, GroceryList, GroceryRepo, ImageCodec, ImageRepo,
    ListedRecipe, MediaStore, NewGroceryItem, PasswordHasher, RecipeRepo, SessionRepo,
    SessionTokens, SettingsRepo, StorageHealth, TagRepo, UserRepo,
};

struct StoredUser {
    user: User,
    password_hash: String,
}

struct StoredRecipe {
    id: Uuid,
    input: RecipeInput,
    created_by: Option<Uuid>,
    updated_by: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

struct StoredGroceryItem {
    item: GroceryItem,
    cleared: bool,
}

/// The one grocery list and the household's choices that outlive it.
struct Grocery {
    list: Option<GroceryList>,
    /// `(recipe id, scale, added at)`.
    recipes: Vec<(Uuid, f64, DateTime<Utc>)>,
    items: Vec<StoredGroceryItem>,
    overrides: HashMap<String, Section>,
    staples: HashSet<String>,
}

struct State {
    users: HashMap<Uuid, StoredUser>,
    /// token hash -> (user id, expires at)
    sessions: HashMap<Vec<u8>, (Uuid, DateTime<Utc>)>,
    images: HashMap<Uuid, Image>,
    recipes: HashMap<Uuid, StoredRecipe>,
    settings: Settings,
    grocery: Grocery,
}

impl State {
    /// The list's live recipes in the order they were added.
    fn listed_recipes(&self) -> Vec<ListedRecipe> {
        let mut on_list = self.grocery.recipes.clone();
        on_list.sort_by_key(|(id, _, added_at)| (*added_at, *id));
        on_list
            .into_iter()
            .filter_map(|(id, scale, _)| {
                let r = self.recipes.get(&id).filter(|r| r.deleted_at.is_none())?;
                Some(ListedRecipe {
                    recipe_id: id,
                    scale,
                    title: r.input.title.clone(),
                    servings: r.input.servings.clone(),
                    image_file: self.file(r.input.image_id).map(|f| f.file_name.clone()),
                    ingredients: r.input.ingredients.clone(),
                })
            })
            .collect()
    }

    fn user_ref(&self, id: Option<Uuid>) -> Option<UserRef> {
        let u = &self.users.get(&id?)?.user;
        Some(UserRef {
            id: u.id,
            display_name: u.display_name.clone(),
        })
    }

    fn file(&self, id: Option<Uuid>) -> Option<&Image> {
        self.images.get(&id?)
    }

    fn tags(r: &StoredRecipe) -> Vec<String> {
        let mut tags = r.input.tags.clone();
        tags.sort();
        tags.dedup();
        tags
    }

    fn recipe(&self, r: &StoredRecipe) -> Recipe {
        let i = &r.input;
        Recipe {
            id: r.id,
            title: i.title.clone(),
            description: i.description.clone(),
            ingredients: i.ingredients.clone(),
            steps: i.steps.clone(),
            servings: i.servings.clone(),
            prep_minutes: i.prep_minutes,
            cook_minutes: i.cook_minutes,
            total_minutes: i.total_minutes,
            notes: i.notes.clone(),
            source_url: i.source_url.clone(),
            source_name: i.source_name.clone(),
            source_type: i.source_type,
            image_id: i.image_id,
            photo_image_ids: i.photo_image_ids.clone(),
            tags: Self::tags(r),
            image_file: self.file(i.image_id).map(|f| f.file_name.clone()),
            image_display_file: self
                .file(i.image_id)
                .and_then(|f| f.display_file_name.clone()),
            photo_files: i
                .photo_image_ids
                .iter()
                .filter_map(|id| self.file(Some(*id)).map(|f| f.file_name.clone()))
                .collect(),
            created_by: self.user_ref(r.created_by),
            updated_by: self.user_ref(r.updated_by),
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }

    fn summary(&self, r: &StoredRecipe) -> RecipeSummary {
        let i = &r.input;
        RecipeSummary {
            id: r.id,
            title: i.title.clone(),
            description: i.description.clone(),
            total_minutes: i.total_minutes,
            tags: Self::tags(r),
            image_file: self.file(i.image_id).map(|f| f.file_name.clone()),
            image_display_file: self
                .file(i.image_id)
                .and_then(|f| f.display_file_name.clone()),
            source_type: i.source_type,
            updated_at: r.updated_at,
        }
    }

    fn check_images(&self, input: &RecipeInput) -> DomainResult<()> {
        let unknown = |id: &Uuid| !self.images.contains_key(id);
        if input.image_id.iter().any(unknown) || input.photo_image_ids.iter().any(unknown) {
            return Err(DomainError::validation(
                "imageId/photoImageIds: unknown image.",
            ));
        }
        Ok(())
    }
}

/// Every repository over one shared state: `Arc<MemoryStore>` coerces to each `Arc<dyn ...Repo>`. Built with the
/// clock that stamps rows and decides expiry.
pub struct MemoryStore {
    clock: Arc<dyn Clock>,
    state: Mutex<State>,
}

impl MemoryStore {
    pub fn new(clock: Arc<dyn Clock>) -> Self {
        Self {
            clock,
            state: Mutex::new(State {
                users: HashMap::new(),
                sessions: HashMap::new(),
                images: HashMap::new(),
                recipes: HashMap::new(),
                settings: Settings {
                    plate_treatment: true,
                },
                grocery: Grocery {
                    list: None,
                    recipes: Vec::new(),
                    items: Vec::new(),
                    overrides: HashMap::new(),
                    staples: ["salt", "black pepper", "pepper", "water"]
                        .map(String::from)
                        .into(),
                },
            }),
        }
    }

    /// How many recipe rows the store holds, soft-deleted ones included (for tests of all-or-nothing writes).
    pub fn recipe_rows(&self) -> usize {
        self.lock().recipes.len()
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().expect("memory store lock")
    }
}

fn not_found() -> DomainError {
    DomainError::NotFound("Recipe not found.".into())
}

#[async_trait]
impl RecipeRepo for MemoryStore {
    async fn create(&self, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let mut s = self.lock();
        s.check_images(&input)?;
        let now = self.clock.now();
        let id = Uuid::new_v4();
        let stored = StoredRecipe {
            id,
            input,
            created_by: Some(user_id),
            updated_by: Some(user_id),
            created_at: now,
            updated_at: now,
            deleted_at: None,
        };
        let recipe = s.recipe(&stored);
        s.recipes.insert(id, stored);
        Ok(recipe)
    }

    async fn create_many(
        &self,
        user_id: Uuid,
        inputs: Vec<RecipeInput>,
    ) -> DomainResult<Vec<Uuid>> {
        let mut s = self.lock();
        for input in &inputs {
            s.check_images(input)?;
        }
        let now = self.clock.now();
        let mut ids = Vec::with_capacity(inputs.len());
        for input in inputs {
            let id = Uuid::new_v4();
            s.recipes.insert(
                id,
                StoredRecipe {
                    id,
                    input,
                    created_by: Some(user_id),
                    updated_by: Some(user_id),
                    created_at: now,
                    updated_at: now,
                    deleted_at: None,
                },
            );
            ids.push(id);
        }
        Ok(ids)
    }

    async fn get(&self, id: Uuid) -> DomainResult<Option<Recipe>> {
        let s = self.lock();
        Ok(s.recipes
            .get(&id)
            .filter(|r| r.deleted_at.is_none())
            .map(|r| s.recipe(r)))
    }

    async fn update(&self, id: Uuid, user_id: Uuid, input: RecipeInput) -> DomainResult<Recipe> {
        let mut s = self.lock();
        s.check_images(&input)?;
        let now = self.clock.now();
        let r = s
            .recipes
            .get_mut(&id)
            .filter(|r| r.deleted_at.is_none())
            .ok_or_else(not_found)?;
        r.input = input;
        r.updated_by = Some(user_id);
        r.updated_at = now;
        Ok(s.recipe(&s.recipes[&id]))
    }

    async fn soft_delete(&self, id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let mut s = self.lock();
        let r = s
            .recipes
            .get_mut(&id)
            .filter(|r| r.deleted_at.is_none())
            .ok_or_else(not_found)?;
        r.deleted_at = Some(now);
        Ok(())
    }

    async fn restore(&self, id: Uuid) -> DomainResult<Recipe> {
        let earliest = self.clock.now() - Duration::minutes(i64::from(RESTORE_WINDOW_MINUTES));
        let mut s = self.lock();
        let r = s.recipes.get_mut(&id).ok_or_else(not_found)?;
        if let Some(deleted_at) = r.deleted_at {
            if deleted_at <= earliest {
                return Err(DomainError::Conflict(format!(
                    "This recipe was deleted more than {RESTORE_WINDOW_MINUTES} minutes ago and can no longer be restored."
                )));
            }
            r.deleted_at = None;
        }
        Ok(s.recipe(&s.recipes[&id]))
    }

    async fn purge_deleted_before(&self, cutoff: DateTime<Utc>) -> DomainResult<u64> {
        let mut s = self.lock();
        let before = s.recipes.len();
        s.recipes
            .retain(|_, r| !r.deleted_at.is_some_and(|d| d < cutoff));
        let State {
            recipes, grocery, ..
        } = &mut *s;
        grocery.recipes.retain(|(id, ..)| recipes.contains_key(id));
        Ok((before - s.recipes.len()) as u64)
    }

    async fn search(&self, query: SearchQuery) -> DomainResult<Page<RecipeSummary>> {
        let q = query.normalized();
        let s = self.lock();
        let matcher = q.text.as_deref().map(search::Matcher::new);
        let mut hits: Vec<(&StoredRecipe, search::Rank)> = s
            .recipes
            .values()
            .filter(|r| r.deleted_at.is_none())
            .filter(|r| {
                q.tag
                    .as_ref()
                    .is_none_or(|t| r.input.tags.iter().any(|x| x.to_lowercase() == *t))
            })
            .filter_map(|r| match &matcher {
                None => Some((r, search::Rank::default())),
                Some(m) => m
                    .rank(&r.input.title, &r.input.tags, &search::doc_tokens(&r.input))
                    .map(|rank| (r, rank)),
            })
            .collect();
        let title = |r: &StoredRecipe| r.input.title.to_lowercase();
        hits.sort_by(|(a, ra), (b, rb)| {
            match q.sort {
                Sort::Default if matcher.is_some() => rb
                    .title_hit
                    .cmp(&ra.title_hit)
                    .then(rb.score.cmp(&ra.score))
                    .then(b.created_at.cmp(&a.created_at)),
                Sort::Default | Sort::Newest => b.created_at.cmp(&a.created_at),
                Sort::Title => title(a).cmp(&title(b)),
                Sort::Time => {
                    let (x, y) = (a.input.total_minutes, b.input.total_minutes);
                    x.is_none()
                        .cmp(&y.is_none())
                        .then(x.cmp(&y))
                        .then(title(a).cmp(&title(b)))
                }
            }
            .then(a.id.cmp(&b.id))
        });
        let skip = usize::try_from(q.offset).unwrap_or(0);
        let take = usize::try_from(q.limit).unwrap_or(0);
        Ok(Page {
            total: hits.len() as i64,
            items: hits
                .into_iter()
                .skip(skip)
                .take(take)
                .map(|(r, _)| s.summary(r))
                .collect(),
        })
    }

    async fn live_source_urls(&self, hosts: &[String]) -> DomainResult<Vec<(Uuid, String)>> {
        let hosts: Vec<String> = hosts.iter().map(|h| h.to_lowercase()).collect();
        let s = self.lock();
        let mut rows: Vec<(&StoredRecipe, &String)> = s
            .recipes
            .values()
            .filter(|r| r.deleted_at.is_none())
            .filter_map(|r| r.input.source_url.as_ref().map(|u| (r, u)))
            .filter(|(_, u)| {
                let u = u.to_lowercase();
                hosts.iter().any(|h| u.contains(h.as_str()))
            })
            .collect();
        rows.sort_by_key(|(r, _)| (r.created_at, r.id));
        Ok(rows.into_iter().map(|(r, u)| (r.id, u.clone())).collect())
    }
}

#[async_trait]
impl StorageHealth for MemoryStore {
    async fn ping(&self) -> DomainResult<()> {
        drop(self.lock());
        Ok(())
    }
}

#[async_trait]
impl ImageRepo for MemoryStore {
    async fn add(&self, image: Image) -> DomainResult<()> {
        self.lock().images.insert(image.id, image);
        Ok(())
    }

    async fn delete(&self, ids: &[Uuid]) -> DomainResult<()> {
        let mut s = self.lock();
        for id in ids {
            s.images.remove(id);
        }
        for r in s.recipes.values_mut() {
            if r.input.image_id.is_some_and(|i| ids.contains(&i)) {
                r.input.image_id = None;
            }
            r.input.photo_image_ids.retain(|i| !ids.contains(i));
        }
        Ok(())
    }

    async fn set_display_file(&self, id: Uuid, file_name: &str) -> DomainResult<bool> {
        let mut s = self.lock();
        match s
            .images
            .get_mut(&id)
            .filter(|i| i.display_file_name.is_none())
        {
            Some(image) => {
                image.display_file_name = Some(file_name.to_string());
                Ok(true)
            }
            None => Ok(false),
        }
    }

    async fn without_display_file(&self) -> DomainResult<Vec<Uuid>> {
        let s = self.lock();
        let mut ids: Vec<Uuid> = s
            .images
            .values()
            .filter(|i| i.display_file_name.is_none())
            .map(|i| i.id)
            .collect();
        ids.sort();
        Ok(ids)
    }
}

fn username_taken(s: &State, username: &str) -> bool {
    s.users
        .values()
        .any(|u| u.user.username.eq_ignore_ascii_case(username))
}

fn insert_user(s: &mut State, now: DateTime<Utc>, new: NewUser) -> User {
    let user = User {
        id: Uuid::new_v4(),
        username: new.username,
        display_name: new.display_name,
        role: new.role,
        created_at: now,
    };
    s.users.insert(
        user.id,
        StoredUser {
            user: user.clone(),
            password_hash: new.password_hash,
        },
    );
    user
}

#[async_trait]
impl UserRepo for MemoryStore {
    async fn any(&self) -> DomainResult<bool> {
        Ok(!self.lock().users.is_empty())
    }

    async fn create(&self, new: NewUser) -> DomainResult<User> {
        let mut s = self.lock();
        if username_taken(&s, &new.username) {
            return Err(DomainError::Conflict(
                "That username is already taken.".into(),
            ));
        }
        Ok(insert_user(&mut s, self.clock.now(), new))
    }

    async fn create_first_admin(&self, new: NewUser) -> DomainResult<User> {
        let mut s = self.lock();
        if !s.users.is_empty() {
            return Err(DomainError::Forbidden("Setup is already done.".into()));
        }
        Ok(insert_user(&mut s, self.clock.now(), new))
    }

    async fn list(&self) -> DomainResult<Vec<User>> {
        let mut users: Vec<User> = self.lock().users.values().map(|u| u.user.clone()).collect();
        users.sort_by_key(|u| (u.display_name.to_lowercase(), u.username.clone()));
        Ok(users)
    }

    async fn find_with_hash(&self, username: &str) -> DomainResult<Option<(User, String)>> {
        let s = self.lock();
        Ok(s.users
            .values()
            .find(|u| u.user.username.eq_ignore_ascii_case(username))
            .map(|u| (u.user.clone(), u.password_hash.clone())))
    }

    async fn password_hash(&self, id: Uuid) -> DomainResult<Option<String>> {
        Ok(self.lock().users.get(&id).map(|u| u.password_hash.clone()))
    }

    async fn set_password_hash(
        &self,
        id: Uuid,
        hash: &str,
        expected: Option<&str>,
        keep_session: Option<&[u8]>,
    ) -> DomainResult<()> {
        let mut s = self.lock();
        let user = s
            .users
            .get_mut(&id)
            .ok_or_else(|| DomainError::NotFound("No such user.".into()))?;
        if expected.is_some_and(|e| e != user.password_hash) {
            return Err(DomainError::Conflict(
                "The password changed in the meantime.".into(),
            ));
        }
        user.password_hash = hash.to_string();
        s.sessions
            .retain(|token, (user, _)| *user != id || Some(token.as_slice()) == keep_session);
        Ok(())
    }

    async fn remove(&self, id: Uuid) -> DomainResult<()> {
        let mut s = self.lock();
        let role = &s
            .users
            .get(&id)
            .ok_or_else(|| DomainError::NotFound("No such user.".into()))?
            .user
            .role;
        let admins = s
            .users
            .values()
            .filter(|u| u.user.role == ROLE_ADMIN)
            .count();
        if role == ROLE_ADMIN && admins <= 1 {
            return Err(DomainError::Forbidden(
                "You can't remove the last admin.".into(),
            ));
        }
        s.users.remove(&id);
        s.sessions.retain(|_, (user, _)| *user != id);
        let gone = Some(id);
        for r in s.recipes.values_mut() {
            if r.created_by == gone {
                r.created_by = None;
            }
            if r.updated_by == gone {
                r.updated_by = None;
            }
        }
        for i in s.images.values_mut().filter(|i| i.created_by == gone) {
            i.created_by = None;
        }
        Ok(())
    }
}

#[async_trait]
impl SessionRepo for MemoryStore {
    async fn create(
        &self,
        user_id: Uuid,
        token_hash: Vec<u8>,
        expires_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut s = self.lock();
        if !s.users.contains_key(&user_id) {
            return Err(DomainError::NotFound("No such user.".into()));
        }
        if s.sessions.contains_key(&token_hash) {
            return Err(DomainError::Conflict("That session already exists.".into()));
        }
        s.sessions.insert(token_hash, (user_id, expires_at));
        Ok(())
    }

    async fn user_for_token(&self, token_hash: &[u8]) -> DomainResult<Option<User>> {
        let s = self.lock();
        let now = self.clock.now();
        Ok(s.sessions
            .get(token_hash)
            .filter(|(_, expires_at)| *expires_at > now)
            .and_then(|(user, _)| s.users.get(user))
            .map(|u| u.user.clone()))
    }

    async fn delete(&self, token_hash: &[u8]) -> DomainResult<()> {
        self.lock().sessions.remove(token_hash);
        Ok(())
    }

    async fn purge_expired(&self) -> DomainResult<u64> {
        let now = self.clock.now();
        let mut s = self.lock();
        let before = s.sessions.len();
        s.sessions.retain(|_, (_, expires_at)| *expires_at >= now);
        Ok((before - s.sessions.len()) as u64)
    }
}

#[async_trait]
impl SettingsRepo for MemoryStore {
    async fn get(&self) -> DomainResult<Settings> {
        Ok(self.lock().settings)
    }

    async fn set(&self, settings: Settings) -> DomainResult<Settings> {
        self.lock().settings = settings;
        Ok(settings)
    }
}

#[async_trait]
impl TagRepo for MemoryStore {
    async fn list_in_use(&self) -> DomainResult<Vec<TagCount>> {
        let s = self.lock();
        let mut counts: BTreeMap<String, i64> = BTreeMap::new();
        for r in s.recipes.values().filter(|r| r.deleted_at.is_none()) {
            for tag in State::tags(r) {
                *counts.entry(tag).or_default() += 1;
            }
        }
        Ok(counts
            .into_iter()
            .map(|(name, count)| TagCount { name, count })
            .collect())
    }
}

fn no_item() -> DomainError {
    DomainError::NotFound("No such item.".into())
}

#[async_trait]
impl GroceryRepo for MemoryStore {
    async fn get_or_create_list(&self) -> DomainResult<GroceryList> {
        let now = self.clock.now();
        let mut s = self.lock();
        Ok(s.grocery
            .list
            .get_or_insert_with(|| GroceryList {
                id: Uuid::new_v4(),
                updated_at: now,
            })
            .clone())
    }

    async fn recipes(&self, _list_id: Uuid) -> DomainResult<Vec<ListedRecipe>> {
        Ok(self.lock().listed_recipes())
    }

    async fn items(&self, _list_id: Uuid) -> DomainResult<Vec<GroceryItem>> {
        let s = self.lock();
        Ok(s.grocery
            .items
            .iter()
            .filter(|i| !i.cleared)
            .map(|i| i.item.clone())
            .collect())
    }

    async fn item(&self, id: Uuid) -> DomainResult<Option<GroceryItem>> {
        let s = self.lock();
        Ok(s.grocery
            .items
            .iter()
            .find(|i| i.item.id == id && !i.cleared)
            .map(|i| i.item.clone()))
    }

    async fn add_recipe(&self, _list_id: Uuid, recipe_id: Uuid, scale: f64) -> DomainResult<()> {
        let now = self.clock.now();
        let mut s = self.lock();
        if !s
            .recipes
            .get(&recipe_id)
            .is_some_and(|r| r.deleted_at.is_none())
        {
            return Err(not_found());
        }
        let g = &mut s.grocery;
        match g.recipes.iter_mut().find(|(id, ..)| *id == recipe_id) {
            Some(on_list) => on_list.1 = scale,
            None => g.recipes.push((recipe_id, scale, now)),
        }
        g.touch(now);
        Ok(())
    }

    async fn remove_recipe(&self, _list_id: Uuid, recipe_id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        let before = g.recipes.len();
        g.recipes.retain(|(id, ..)| *id != recipe_id);
        if g.recipes.len() == before {
            return Err(DomainError::NotFound(
                "That recipe is not on the list.".into(),
            ));
        }
        g.touch(now);
        Ok(())
    }

    async fn recompute(&self, list_id: Uuid, compute: &Compute) -> DomainResult<()> {
        let now = self.clock.now();
        let mut s = self.lock();
        if s.grocery.list.as_ref().is_none_or(|l| l.id != list_id) {
            return Err(DomainError::NotFound("No such list.".into()));
        }
        let computed = compute(&s.listed_recipes(), &s.grocery.overrides);
        let g = &mut s.grocery;
        let keys: HashSet<&str> = computed.iter().map(|c| c.key.as_str()).collect();
        let before = g.items.len();
        g.items
            .retain(|i| i.item.manual || keys.contains(i.item.key.as_str()));
        let mut changed = g.items.len() != before;
        for mut c in computed {
            c.amounts = GroceryItem::finite_amounts(c.amounts);
            let existing = g
                .items
                .iter_mut()
                .find(|i| !i.item.manual && i.item.key == c.key);
            let Some(stored) = existing else {
                g.items.push(StoredGroceryItem {
                    item: GroceryItem {
                        id: Uuid::new_v4(),
                        key: c.key,
                        name: c.name,
                        amounts: c.amounts,
                        section: c.section,
                        checked: false,
                        manual: false,
                        recipe_ids: c.recipe_ids,
                    },
                    cleared: false,
                });
                changed = true;
                continue;
            };
            let item = &mut stored.item;
            let more = !GroceryItem::same_amounts(&item.amounts, &c.amounts);
            if more
                || item.name != c.name
                || item.section != c.section
                || item.recipe_ids != c.recipe_ids
            {
                (item.name, item.amounts, item.section, item.recipe_ids) =
                    (c.name, c.amounts, c.section, c.recipe_ids);
                if more {
                    item.checked = false;
                    stored.cleared = false;
                }
                changed = true;
            }
        }
        if changed {
            g.touch(now);
        }
        Ok(())
    }

    async fn add_manual(&self, _list_id: Uuid, new: NewGroceryItem) -> DomainResult<GroceryItem> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        let item = GroceryItem {
            id: Uuid::new_v4(),
            key: new.key,
            name: new.name,
            amounts: GroceryItem::finite_amounts(new.amounts),
            section: new.section,
            checked: false,
            manual: true,
            recipe_ids: Vec::new(),
        };
        g.items.push(StoredGroceryItem {
            item: item.clone(),
            cleared: false,
        });
        g.touch(now);
        Ok(item)
    }

    async fn update_item(
        &self,
        id: Uuid,
        checked: Option<bool>,
        section: Option<Section>,
        staple: Option<bool>,
    ) -> DomainResult<GroceryItem> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        let key = g
            .items
            .iter()
            .find(|i| i.item.id == id && !i.cleared)
            .ok_or_else(no_item)?
            .item
            .key
            .clone();
        if let Some(checked) = checked {
            for i in g.items.iter_mut().filter(|i| i.item.id == id) {
                i.item.checked = checked;
            }
        }
        if let Some(section) = section {
            g.overrides.insert(key.clone(), section);
            for i in g.items.iter_mut().filter(|i| i.item.key == key) {
                i.item.section = section;
            }
        }
        match staple {
            Some(true) => {
                g.staples.insert(key);
            }
            Some(false) => {
                g.staples.remove(&key);
            }
            None => {}
        }
        g.touch(now);
        Ok(g.items
            .iter()
            .find(|i| i.item.id == id)
            .map(|i| i.item.clone())
            .expect("the item was just found"))
    }

    async fn clear_item(&self, id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        if !g.items.iter().any(|i| i.item.id == id && !i.cleared) {
            return Err(no_item());
        }
        g.clear_where(|i| i.item.id == id);
        g.touch(now);
        Ok(())
    }

    async fn clear_checked(&self, _list_id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        g.clear_where(|i| i.item.checked);
        g.touch(now);
        Ok(())
    }

    async fn clear_all(&self, _list_id: Uuid) -> DomainResult<()> {
        let now = self.clock.now();
        let g = &mut self.lock().grocery;
        g.recipes.clear();
        g.items.clear();
        g.touch(now);
        Ok(())
    }

    async fn overrides(&self) -> DomainResult<HashMap<String, Section>> {
        Ok(self.lock().grocery.overrides.clone())
    }

    async fn staples(&self) -> DomainResult<HashSet<String>> {
        Ok(self.lock().grocery.staples.clone())
    }
}

impl Grocery {
    fn touch(&mut self, now: DateTime<Utc>) {
        if let Some(list) = &mut self.list {
            list.updated_at = now;
        }
    }

    /// Removes the visible items `pick` selects from the list: manual ones are deleted, generated ones cleared.
    fn clear_where(&mut self, pick: impl Fn(&StoredGroceryItem) -> bool) {
        self.items.retain_mut(|i| {
            if i.cleared || !pick(i) {
                return true;
            }
            i.cleared = !i.item.manual;
            !i.item.manual
        });
    }
}

/// Blobs in a map.
#[derive(Default)]
pub struct MemoryMedia {
    blobs: Mutex<HashMap<String, Vec<u8>>>,
}

impl MemoryMedia {
    /// The stored file names, sorted (a test of "no orphan files").
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .blobs
            .lock()
            .expect("media lock")
            .keys()
            .cloned()
            .collect();
        names.sort();
        names
    }
}

fn check_name(name: &str) -> DomainResult<()> {
    if !domain::validate::media_file_name(name) {
        return Err(DomainError::validation("name: not a plain file name."));
    }
    Ok(())
}

#[async_trait]
impl MediaStore for MemoryMedia {
    async fn put(&self, name: &str, bytes: Vec<u8>) -> DomainResult<()> {
        check_name(name)?;
        self.blobs
            .lock()
            .expect("media lock")
            .insert(name.to_string(), bytes);
        Ok(())
    }

    async fn get(&self, name: &str) -> DomainResult<Option<Vec<u8>>> {
        check_name(name)?;
        Ok(self.blobs.lock().expect("media lock").get(name).cloned())
    }

    async fn delete(&self, name: &str) -> DomainResult<()> {
        check_name(name)?;
        self.blobs.lock().expect("media lock").remove(name);
        Ok(())
    }
}

/// A password "hasher" for tests: not secure, and instant. Each hash carries a counter, so two hashes of one
/// password differ, as real salted hashes do.
#[derive(Default)]
pub struct FakePasswordHasher {
    count: AtomicU64,
    verifies: AtomicU64,
    verifies_without_hash: AtomicU64,
}

impl FakePasswordHasher {
    /// How many times `verify` ran (a test of "no hashing work happened").
    pub fn verify_count(&self) -> u64 {
        self.verifies.load(Ordering::SeqCst)
    }

    /// How many of those got no stored hash (the unknown-user path, which must still do the work).
    pub fn verify_without_hash_count(&self) -> u64 {
        self.verifies_without_hash.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl PasswordHasher for FakePasswordHasher {
    async fn hash(&self, password: String) -> DomainResult<String> {
        Ok(format!(
            "fake${}${password}",
            self.count.fetch_add(1, Ordering::SeqCst)
        ))
    }

    async fn verify(&self, password: String, hash: Option<String>) -> DomainResult<bool> {
        self.verifies.fetch_add(1, Ordering::SeqCst);
        if hash.is_none() {
            self.verifies_without_hash.fetch_add(1, Ordering::SeqCst);
        }
        Ok(hash
            .as_deref()
            .and_then(|h| h.strip_prefix("fake$"))
            .and_then(|h| h.split_once('$'))
            .is_some_and(|(_, stored)| stored == password))
    }
}

/// Tokens `token-0`, `token-1`, ... whose digest is their bytes: deterministic, not secure.
#[derive(Default)]
pub struct FakeSessionTokens {
    count: AtomicU64,
}

impl SessionTokens for FakeSessionTokens {
    fn generate(&self) -> String {
        format!("token-{}", self.count.fetch_add(1, Ordering::SeqCst))
    }

    fn digest(&self, token: &str) -> Vec<u8> {
        token.as_bytes().to_vec()
    }
}

/// An image "codec" for tests: the JPEG is the input as is (empty input is "not an image"), 1 px high and as wide
/// as the input is long, and the rendition is the input behind `display:`.
#[derive(Default)]
pub struct FakeImageCodec {
    /// Makes `encode` return no rendition, as a failed one would.
    pub display_fails: bool,
}

#[async_trait]
impl ImageCodec for FakeImageCodec {
    async fn encode(&self, id: Uuid, data: Vec<u8>) -> DomainResult<EncodedImage> {
        if data.is_empty() {
            return Err(DomainError::UnsupportedMedia(
                "That file is not an image we can read (JPEG, PNG, WebP or GIF).".into(),
            ));
        }
        let display = if self.display_fails {
            None
        } else {
            Some(self.render_display(id, data.clone()).await?)
        };
        Ok(EncodedImage {
            width: data.len() as u32,
            height: 1,
            jpeg: data,
            display,
        })
    }

    async fn render_display(&self, _id: Uuid, jpeg: Vec<u8>) -> DomainResult<Vec<u8>> {
        Ok([b"display:".as_slice(), &jpeg].concat())
    }
}

/// What a [`MemoryBackup`] writer was given, in call order.
#[derive(Default)]
pub struct WrittenBackup {
    pub photos: Vec<(Uuid, Vec<u8>)>,
    pub recipes: Vec<domain::BackupRecipe>,
}

type Opened = DomainResult<(Vec<domain::BackupRecipe>, HashMap<Uuid, Vec<u8>>)>;

/// A scripted [`BackupFormat`] for service tests. Writers record what they are given in [`MemoryBackup::written`]
/// and emit one placeholder byte per call. `open` ignores the path and serves what [`MemoryBackup::serve`] set
/// once (or its error), with no limit checks: those belong to the real format.
#[derive(Default)]
pub struct MemoryBackup {
    written: Arc<Mutex<WrittenBackup>>,
    serving: Arc<Mutex<Option<Opened>>>,
}

impl MemoryBackup {
    /// The recipes and photos (by archive image id) the next `open` finds.
    pub fn serve(&self, recipes: Vec<domain::BackupRecipe>, photos: HashMap<Uuid, Vec<u8>>) {
        *self.serving.lock().expect("backup lock") = Some(Ok((recipes, photos)));
    }

    /// Makes the next `open` fail with `error`.
    pub fn refuse(&self, error: DomainError) {
        *self.serving.lock().expect("backup lock") = Some(Err(error));
    }

    /// Takes what writers have been given so far.
    pub fn written(&self) -> WrittenBackup {
        std::mem::take(&mut *self.written.lock().expect("backup lock"))
    }
}

struct MemoryBackupWriter(Arc<Mutex<WrittenBackup>>);

impl ports::BackupWriter for MemoryBackupWriter {
    fn photo(&mut self, image_id: Uuid, jpeg: &[u8]) -> DomainResult<Vec<u8>> {
        self.0
            .lock()
            .expect("backup lock")
            .photos
            .push((image_id, jpeg.to_vec()));
        Ok(vec![b'p'])
    }

    fn finish(
        &mut self,
        _exported_at: DateTime<Utc>,
        recipes: &[domain::BackupRecipe],
    ) -> DomainResult<Vec<u8>> {
        self.0.lock().expect("backup lock").recipes = recipes
            .iter()
            .map(|r| domain::BackupRecipe {
                id: r.id,
                input: RecipeInput {
                    title: r.input.title.clone(),
                    image_id: r.input.image_id,
                    photo_image_ids: r.input.photo_image_ids.clone(),
                    ..Default::default()
                },
            })
            .collect();
        Ok(vec![b'r'])
    }
}

struct MemoryBackupReader {
    recipes: Mutex<Option<Vec<domain::BackupRecipe>>>,
    photos: HashMap<Uuid, Vec<u8>>,
}

#[async_trait]
impl ports::BackupReader for MemoryBackupReader {
    async fn recipes(&self) -> DomainResult<Vec<domain::BackupRecipe>> {
        Ok(self
            .recipes
            .lock()
            .expect("backup lock")
            .take()
            .unwrap_or_default())
    }

    async fn photo(&self, image_id: Uuid) -> DomainResult<Option<Vec<u8>>> {
        Ok(self.photos.get(&image_id).cloned())
    }
}

#[async_trait]
impl ports::BackupFormat for MemoryBackup {
    fn writer(&self) -> Box<dyn ports::BackupWriter> {
        Box::new(MemoryBackupWriter(self.written.clone()))
    }

    async fn open(
        &self,
        _path: std::path::PathBuf,
        _limits: domain::BackupLimits,
    ) -> DomainResult<Box<dyn ports::BackupReader>> {
        let (recipes, photos) = self
            .serving
            .lock()
            .expect("backup lock")
            .take()
            .ok_or_else(|| DomainError::validation("nothing to open"))??;
        Ok(Box::new(MemoryBackupReader {
            recipes: Mutex::new(Some(recipes)),
            photos,
        }))
    }
}
