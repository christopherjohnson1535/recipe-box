//! Fakes for the import ports: scripted, and recording what they were asked.

use std::{collections::HashMap, sync::Mutex, time::Duration};

use std::sync::Arc;

use adapter_memory::MemoryStore;
use async_trait::async_trait;
use domain::{
    AiProvider, DomainError, DomainResult, Image, PhotoMode, RecipeDraft,
    cook_plan::{PlanDish, RawPlan},
    url::Url,
    uuid::Uuid,
};
use ports::{
    FetchedPage, ImageRepo, PageContent, PageFetcher, PageReader, RecipeExtractor, SpawnedTask,
    TaskSpawner,
};

/// Pages by address. An address that is not scripted is `FetchFailed("unreachable")`.
#[derive(Default)]
pub struct FakeFetcher {
    /// address -> (address after redirects, body)
    pub pages: Mutex<HashMap<String, (String, Vec<u8>)>>,
    /// Every `(address, max_bytes)` asked for.
    pub calls: Mutex<Vec<(String, usize)>>,
}

impl FakeFetcher {
    pub fn page(&self, url: &str, final_url: &str, body: &[u8]) {
        self.pages
            .lock()
            .unwrap()
            .insert(url.into(), (final_url.into(), body.to_vec()));
    }
}

#[async_trait]
impl PageFetcher for FakeFetcher {
    async fn fetch(&self, url: &Url, max_bytes: usize) -> DomainResult<FetchedPage> {
        self.calls
            .lock()
            .unwrap()
            .push((url.to_string(), max_bytes));
        match self.pages.lock().unwrap().get(url.as_str()) {
            Some((final_url, body)) => Ok(FetchedPage {
                final_url: Url::parse(final_url).unwrap(),
                content_type: Some("text/html".into()),
                body: body.clone(),
            }),
            None => Err(DomainError::FetchFailed("unreachable".into())),
        }
    }

    fn budget(&self) -> Duration {
        Duration::from_secs(15)
    }
}

/// Answers every `read` with what was scripted (once) and records `want_text`.
#[derive(Default)]
pub struct FakeReader {
    pub content: Mutex<Option<DomainResult<PageContent>>>,
    pub want_text: Mutex<Vec<bool>>,
}

impl FakeReader {
    pub fn says(&self, content: DomainResult<PageContent>) {
        *self.content.lock().unwrap() = Some(content);
    }
}

#[async_trait]
impl PageReader for FakeReader {
    async fn read(
        &self,
        _: FetchedPage,
        want_text: bool,
        _: Duration,
    ) -> DomainResult<PageContent> {
        self.want_text.lock().unwrap().push(want_text);
        self.content
            .lock()
            .unwrap()
            .take()
            .unwrap_or(Ok(PageContent::Nothing))
    }
}

pub fn draft(title: &str) -> RecipeDraft {
    RecipeDraft {
        title: title.into(),
        ..Default::default()
    }
}

/// The scripted answer to `plan_cook`.
pub type PlanScript = Box<dyn Fn(&[PlanDish]) -> DomainResult<RawPlan> + Send + Sync>;

/// An extractor whose answers are scripted. Defaults: a draft titled "AI soup" for text and images.
pub struct FakeExtractor {
    pub provider: AiProvider,
    pub text: Box<dyn Fn() -> DomainResult<RecipeDraft> + Send + Sync>,
    pub images: Box<dyn Fn() -> DomainResult<RecipeDraft> + Send + Sync>,
    /// Every text it was given, and how many images each photo call had.
    pub seen_text: Mutex<Vec<String>>,
    pub seen_images: Mutex<Vec<usize>>,
    /// `extract_images` never answers (a request that is dropped while the AI is working).
    pub hang: bool,
    /// The answer to `plan_cook`, given the dishes it was asked about. Default: an empty plan.
    pub plan: PlanScript,
    /// The dishes of every `plan_cook` call.
    pub seen_plans: Mutex<Vec<Vec<PlanDish>>>,
}

impl FakeExtractor {
    pub fn on() -> Self {
        Self {
            provider: AiProvider::Anthropic,
            text: Box::new(|| Ok(draft("AI soup"))),
            images: Box::new(|| Ok(draft("AI soup"))),
            seen_text: Default::default(),
            seen_images: Default::default(),
            hang: false,
            plan: Box::new(|_| Ok(RawPlan::default())),
            seen_plans: Default::default(),
        }
    }
}

#[async_trait]
impl RecipeExtractor for FakeExtractor {
    fn provider(&self) -> AiProvider {
        self.provider
    }

    async fn extract_images(&self, images: &[Vec<u8>], _: PhotoMode) -> DomainResult<RecipeDraft> {
        self.seen_images.lock().unwrap().push(images.len());
        if self.hang {
            std::future::pending::<()>().await;
        }
        (self.images)()
    }

    async fn extract_text(&self, text: &str) -> DomainResult<RecipeDraft> {
        self.seen_text.lock().unwrap().push(text.to_string());
        (self.text)()
    }

    async fn plan_cook(&self, dishes: &[PlanDish]) -> DomainResult<RawPlan> {
        self.seen_plans.lock().unwrap().push(dishes.to_vec());
        (self.plan)(dishes)
    }
}

/// Holds spawned tasks until the test runs them.
#[derive(Default)]
pub struct CollectingSpawner {
    tasks: Mutex<Vec<(&'static str, SpawnedTask)>>,
}

impl CollectingSpawner {
    pub fn spawned(&self) -> usize {
        self.tasks.lock().unwrap().len()
    }

    /// Runs every held task; each one's label and result, in spawn order.
    pub async fn run_all(&self) -> Vec<(&'static str, DomainResult<()>)> {
        let tasks: Vec<_> = self.tasks.lock().unwrap().drain(..).collect();
        let mut done = Vec::new();
        for (what, t) in tasks {
            done.push((what, t.await));
        }
        done
    }
}

impl TaskSpawner for CollectingSpawner {
    fn spawn(&self, what: &'static str, task: SpawnedTask) {
        self.tasks.lock().unwrap().push((what, task));
    }
}

/// The in-memory image repository whose `delete` always fails (a cleanup that cannot finish).
pub struct UndeletableImages(pub Arc<MemoryStore>);

#[async_trait]
impl ImageRepo for UndeletableImages {
    async fn add(&self, image: Image) -> DomainResult<()> {
        self.0.add(image).await
    }

    async fn delete(&self, _: &[Uuid]) -> DomainResult<()> {
        Err(DomainError::Internal("delete failed".into()))
    }

    async fn set_display_file(&self, id: Uuid, file_name: &str) -> DomainResult<bool> {
        self.0.set_display_file(id, file_name).await
    }

    async fn without_display_file(&self) -> DomainResult<Vec<Uuid>> {
        self.0.without_display_file().await
    }
}
