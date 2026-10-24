//! In-memory implementations of the ports, for service tests and as the reference the storage contract suite is
//! checked against. State lives in plain maps behind one mutex; nothing is persisted.

mod search;

use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use domain::{
    DomainError, DomainResult, Image, NewUser, Page, RESTORE_WINDOW_MINUTES, ROLE_ADMIN, Recipe,
    RecipeInput, RecipeSummary, SearchQuery, Settings, Sort, TagCount, User, UserRef,
};
use ports::{
    Clock, ImageRepo, MediaStore, PasswordHasher, RecipeRepo, SessionRepo, SettingsRepo, TagRepo,
    UserRepo,
};
use uuid::Uuid;

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

struct State {
    users: HashMap<Uuid, StoredUser>,
    /// token hash -> (user id, expires at)
    sessions: HashMap<Vec<u8>, (Uuid, DateTime<Utc>)>,
    images: HashMap<Uuid, Image>,
    recipes: HashMap<Uuid, StoredRecipe>,
    settings: Settings,
}

impl State {
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
            }),
        }
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
        let earliest =
            self.clock.now() - chrono::Duration::minutes(i64::from(RESTORE_WINDOW_MINUTES));
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
        keep_session: Option<&[u8]>,
    ) -> DomainResult<()> {
        let mut s = self.lock();
        s.users
            .get_mut(&id)
            .ok_or_else(|| DomainError::NotFound("No such user.".into()))?
            .password_hash = hash.to_string();
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
        self.lock()
            .sessions
            .insert(token_hash, (user_id, expires_at));
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

/// Blobs in a map.
#[derive(Default)]
pub struct MemoryMedia {
    blobs: Mutex<HashMap<String, Vec<u8>>>,
}

fn check_name(name: &str) -> DomainResult<()> {
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
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
        Ok(hash
            .as_deref()
            .and_then(|h| h.strip_prefix("fake$"))
            .and_then(|h| h.split_once('$'))
            .is_some_and(|(_, stored)| stored == password))
    }
}
