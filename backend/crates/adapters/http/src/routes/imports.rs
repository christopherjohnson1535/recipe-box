//! Import routes: capabilities, link, text and photo. Thin: the rules are in `app::ImportService`; this reads the
//! request, maps the result and logs what the service reports.

use app::{ImportNotes, Imported};
use axum::{
    Json,
    extract::{Multipart, State},
};
use domain::{MAX_PHOTOS, PhotoMode as Mode};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::media::log_rendition;
use crate::{
    HttpState,
    dto::{RecipeDraft, media_url},
    error::{AppError, AppJson, AppResult, ErrorBody},
    extract::CurrentUser,
};

#[derive(Serialize, ToSchema)]
pub struct Capabilities {
    ai: bool,
    provider: AiProvider,
}

/// Mirrors the values `AI_PROVIDER` accepts (checked in `Config::from_env`).
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
enum AiProvider {
    None,
    Anthropic,
}

/// What the server can do, so the UI can hide AI features.
#[utoipa::path(get, path = "/api/import/capabilities", operation_id = "getImportCapabilities", tag = "import", security(("session" = [])), responses(
    (status = 200, description = "Whether an AI provider is configured.", body = Capabilities),
))]
pub async fn capabilities(
    State(state): State<HttpState>,
    _user: CurrentUser,
) -> Json<Capabilities> {
    let c = state.services.imports.capabilities();
    Json(Capabilities {
        ai: c.ai,
        provider: match c.provider {
            domain::AiProvider::Anthropic => AiProvider::Anthropic,
            domain::AiProvider::None => AiProvider::None,
        },
    })
}

#[derive(Deserialize, ToSchema)]
#[schema(example = json!({"url": "https://example.com/recipes/pancakes"}))]
pub struct ImportUrlBody {
    url: String,
}

/// Reads a recipe from a web page (LNK-1/2/5/7). Returns a draft; saves nothing. A page with no recipe data goes to
/// the AI as plain text when AI is on (LNK-3).
#[utoipa::path(post, path = "/api/import/url", operation_id = "importFromUrl", tag = "import", security(("session" = [])), request_body = ImportUrlBody, responses(
    (status = 200, description = "The draft. `sourceUrl` is the final URL after redirects.", body = RecipeDraft),
    (status = 400, description = "Not an http(s) address (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe on the page (`no_recipe_found`), or the address is not public (`blocked_address`).", body = ErrorBody),
    (status = 502, description = "The site refused us (`site_blocked`), the fetch failed or timed out (`fetch_failed`), or the AI fallback failed (`ai_error`).", body = ErrorBody),
))]
pub async fn from_url(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    AppJson(body): AppJson<ImportUrlBody>,
) -> AppResult<Json<RecipeDraft>> {
    let imported = state.services.imports.from_url(user.id, &body.url).await?;
    Ok(Json(finish(imported)))
}

/// Logs what the service reports, then fills `image_url` (an address is HTTP's business) from the stored image.
fn finish(imported: Imported) -> RecipeDraft {
    let Imported {
        mut draft,
        images,
        notes,
    } = imported;
    log(&notes);
    if let Some(image) = images.iter().find(|i| Some(i.id) == draft.image_id) {
        draft.image_url = Some(media_url(&image.file_name));
    }
    draft.into()
}

fn log(notes: &ImportNotes) {
    for (id, e) in &notes.rendition_errors {
        log_rendition(*id, e);
    }
    if let Some((image, e)) = &notes.skipped_image {
        tracing::info!(error = %e, image = %image, "import image skipped");
    }
    if notes.cleanup_failed {
        tracing::warn!("could not delete images of a failed request");
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[schema(example = json!({"text": "Pancakes\n2 cups flour\n2 eggs\nMix and fry.", "sourceUrl": "https://example.com/recipes/pancakes"}))]
pub struct ImportTextBody {
    text: String,
    source_url: Option<String>,
}

/// Reads a recipe from pasted text with AI (LNK-3/4). Returns a draft; saves nothing and never fetches `sourceUrl`.
#[utoipa::path(post, path = "/api/import/text", operation_id = "importFromText", tag = "import", security(("session" = [])), request_body = ImportTextBody, responses(
    (status = 200, description = "The draft. `sourceType` is `text`; `sourceUrl` is the given address without credentials or fragment.", body = RecipeDraft),
    (status = 400, description = "Empty text or a bad `sourceUrl` (`validation`).", body = ErrorBody),
    (status = 422, description = "No recipe in the text (`no_recipe_found`), or no AI provider (`ai_disabled`).", body = ErrorBody),
    (status = 502, description = "The AI provider failed (`ai_error`).", body = ErrorBody),
))]
pub async fn from_text(
    State(state): State<HttpState>,
    _user: CurrentUser,
    AppJson(body): AppJson<ImportTextBody>,
) -> AppResult<Json<RecipeDraft>> {
    let draft = state
        .services
        .imports
        .from_text(&body.text, body.source_url.as_deref())
        .await?;
    Ok(Json(draft.into()))
}

/// What the photos show.
#[derive(ToSchema)]
#[schema(rename_all = "lowercase")]
#[allow(dead_code)] // schema only
pub enum PhotoMode {
    /// A cookbook page, card or screenshot of a recipe.
    Recipe,
    /// A photo of a finished dish.
    Dish,
}

/// Multipart body of `POST /api/import/photo`.
#[derive(ToSchema)]
#[allow(dead_code)] // schema only; the handler reads the multipart stream itself
pub struct PhotoForm {
    /// 1 to 6 images (repeat the field).
    #[schema(value_type = Vec<String>, format = Binary)]
    files: Vec<Vec<u8>>,
    mode: PhotoMode,
}

/// Reads a recipe from photos (PHO-2–5). Returns a draft with `photoImageIds` set.
#[utoipa::path(post, path = "/api/import/photo", operation_id = "importFromPhoto", tag = "import", security(("session" = [])),
    request_body(content = PhotoForm, content_type = "multipart/form-data"), responses(
    (status = 200, description = "The draft. `photoImageIds` lists the stored photos in upload order; in `dish` mode `imageId` is the first.", body = RecipeDraft),
    (status = 400, description = "No files, more than 6, or a bad `mode` (`validation`).", body = ErrorBody),
    (status = 413, description = "A file is over `MAX_UPLOAD_MB` (`too_large`).", body = ErrorBody),
    (status = 415, description = "A file is not an image we can read, including a HEIC the server cannot decode (`unsupported_media`). Nothing is kept.", body = ErrorBody),
    (status = 422, description = "No AI provider (`ai_disabled`) or no recipe in the photos (`no_recipe_found`). The photos stay stored and `error.photoImageIds` lists them.", body = ErrorBody),
    (status = 502, description = "The AI provider failed (`ai_error`). The photos stay stored and `error.photoImageIds` lists them.", body = ErrorBody),
))]
pub async fn from_photo(
    State(state): State<HttpState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<RecipeDraft>> {
    let (mut files, mut mode) = (Vec::new(), None);
    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("files") => {
                if files.len() == MAX_PHOTOS {
                    return Err(AppError::validation("files: send at most 6 photos."));
                }
                // Stop reading as soon as the file is over the limit, not after buffering all of it.
                let data = read_capped(field, state.config.max_upload_bytes).await?;
                files.push(data.ok_or(AppError::TooLarge)?);
            }
            Some("mode") => {
                let bytes = read_capped(field, 16).await?;
                let bad = || AppError::validation("mode: use recipe or dish.");
                mode = Some(String::from_utf8(bytes.ok_or_else(bad)?).map_err(|_| bad())?);
            }
            _ => {}
        }
    }
    if files.is_empty() {
        return Err(AppError::validation("files: send 1 to 6 photos."));
    }
    let mode = match mode.as_deref() {
        None | Some("recipe") => Mode::Recipe,
        Some("dish") => Mode::Dish,
        Some(_) => return Err(AppError::validation("mode: use recipe or dish.")),
    };
    match state
        .services
        .imports
        .from_photos(user.id, files, mode)
        .await
    {
        Ok(imported) => Ok(Json(finish(imported))),
        Err(f) => {
            log(&f.notes);
            Err(match f.kept {
                Some(photo_image_ids) => AppError::WithPhotos {
                    error: Box::new(f.error.into()),
                    photo_image_ids,
                },
                None => f.error.into(),
            })
        }
    }
}

/// Reads a multipart field chunk by chunk; `None` as soon as it is longer than `limit` bytes.
async fn read_capped(
    mut field: axum::extract::multipart::Field<'_>,
    limit: usize,
) -> AppResult<Option<Vec<u8>>> {
    let mut out = Vec::new();
    while let Some(chunk) = field.chunk().await? {
        if out.len() + chunk.len() > limit {
            return Ok(None);
        }
        out.extend_from_slice(&chunk);
    }
    Ok(Some(out))
}

#[cfg(test)]
mod tests {
    use std::{
        io,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use adapter_memory::{
        FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryMedia, MemoryStore,
    };
    use app::{Deps, Services};
    use async_trait::async_trait;
    use axum::{body::Body, extract::FromRequest, http::Request};
    use domain::{
        DomainError, DomainResult, RecipeDraft as Draft, User, chrono::Utc, url::Url, uuid::Uuid,
    };
    use ports::{
        FetchedPage, PageContent, PageFetcher, PageReader, RecipeExtractor, SpawnedTask,
        TaskSpawner, contract::ManualClock,
    };

    use super::*;
    use crate::HttpConfig;

    struct Extractor(domain::AiProvider);

    #[async_trait]
    impl RecipeExtractor for Extractor {
        fn provider(&self) -> domain::AiProvider {
            self.0
        }

        async fn extract_images(&self, _: &[Vec<u8>], _: Mode) -> DomainResult<Draft> {
            Err(DomainError::AiDisabled)
        }

        async fn extract_text(&self, _: &str) -> DomainResult<Draft> {
            Err(DomainError::AiDisabled)
        }
    }

    struct NoFetch;

    #[async_trait]
    impl PageFetcher for NoFetch {
        async fn fetch(&self, _: &Url, _: usize) -> DomainResult<FetchedPage> {
            Err(DomainError::FetchFailed("no network in tests".into()))
        }

        fn budget(&self) -> Duration {
            Duration::from_secs(1)
        }
    }

    struct NoRead;

    #[async_trait]
    impl PageReader for NoRead {
        async fn read(&self, _: FetchedPage, _: bool, _: Duration) -> DomainResult<PageContent> {
            Ok(PageContent::Nothing)
        }
    }

    struct NoSpawn;

    impl TaskSpawner for NoSpawn {
        fn spawn(&self, _: &'static str, _: SpawnedTask) {}
    }

    fn state(provider: domain::AiProvider) -> HttpState {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let services = Services::new(Deps {
            recipes: store.clone(),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            google_connections: store.clone(),
            identities: store.clone(),
            cook_log: store.clone(),
            favourites: store.clone(),
            google_signin: Arc::new(app::DisabledGoogleSignIn),
            flows: Arc::new(app::DisabledGoogleSignIn),
            health: store.clone(),
            media: Arc::new(MemoryMedia::default()),
            backup: Arc::new(adapter_memory::MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock,
            extractor: Arc::new(Extractor(provider)),
            fetcher: Arc::new(NoFetch),
            reader: Arc::new(NoRead),
            google: Arc::new(app::DisabledGoogleTasks),
            cipher: Arc::new(adapter_memory::FakeTokenCipher),
            spawner: Arc::new(NoSpawn),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: app::Throttle::new(),
        });
        HttpState {
            services: Arc::new(services),
            trusted_proxies: Default::default(),
            config: HttpConfig {
                cookie_secure: false,
                max_upload_bytes: 1 << 20,
                max_backup_bytes: 1 << 20,
                version: "test",
            },
        }
    }

    fn user() -> User {
        User {
            id: Uuid::new_v4(),
            username: "cook".into(),
            display_name: "Cook".into(),
            email: None,
            role: "member".into(),
            created_at: Utc::now(),
        }
    }

    async fn multipart(parts: &[(&str, &str)]) -> Multipart {
        let mut body = String::new();
        for (name, value) in parts {
            body += &format!(
                "--B\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            );
        }
        body += "--B--\r\n";
        let request = Request::builder()
            .header("content-type", "multipart/form-data; boundary=B")
            .body(Body::from(body))
            .unwrap();
        Multipart::from_request(request, &()).await.unwrap()
    }

    #[tokio::test]
    async fn capabilities_name_the_configured_provider() {
        for (provider, ai, name) in [
            (domain::AiProvider::Anthropic, true, "anthropic"),
            (domain::AiProvider::None, false, "none"),
        ] {
            let Json(c) = capabilities(State(state(provider)), CurrentUser(user())).await;
            assert_eq!(c.ai, ai);
            assert_eq!(serde_json::to_value(&c.provider).unwrap(), name);
        }
    }

    #[tokio::test]
    async fn a_photo_form_with_an_unknown_field_still_imports_and_keeps_the_photo() {
        let form = multipart(&[
            ("note", "ignored"),
            ("files", "jpeg-bytes"),
            ("mode", "dish"),
        ])
        .await;
        let r = from_photo(
            State(state(domain::AiProvider::None)),
            CurrentUser(user()),
            form,
        )
        .await;
        // The extractor refuses (AI off), and the stored photo is reported so the form can show it.
        assert!(
            matches!(&r, Err(AppError::WithPhotos { photo_image_ids, .. }) if photo_image_ids.len() == 1),
            "unexpected result: {}",
            r.err().map_or("ok".into(), |e| e.to_string())
        );
    }

    /// A writer the subscriber logs into and the test reads back.
    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Vec<u8>>>);

    impl io::Write for Captured {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Captured {
        /// What was logged so far (flushing first, as a buffered sink would need).
        fn text(&self) -> String {
            io::Write::flush(&mut self.clone()).unwrap();
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    #[test]
    fn what_the_service_reports_is_logged() {
        let captured = Captured::default();
        let writer = captured.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_writer(move || writer.clone())
            .with_ansi(false)
            .finish();
        let id = Uuid::new_v4();
        tracing::subscriber::with_default(subscriber, || {
            log(&ImportNotes {
                rendition_errors: vec![(id, DomainError::Internal("disk full".into()))],
                skipped_image: Some((
                    "https://example.com/p.jpg".into(),
                    DomainError::BlockedAddress,
                )),
                cleanup_failed: true,
            });
        });
        let out = captured.text();
        assert!(
            out.contains("could not write the display rendition") && out.contains("disk full"),
            "{out}"
        );
        assert!(
            out.contains("import image skipped") && out.contains("https://example.com/p.jpg"),
            "{out}"
        );
        assert!(
            out.contains("could not delete images of a failed request"),
            "{out}"
        );
        assert!(out.contains(&id.to_string()), "{out}");
    }

    #[test]
    fn a_clean_import_logs_nothing() {
        let captured = Captured::default();
        let writer = captured.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_writer(move || writer.clone())
            .finish();
        tracing::subscriber::with_default(subscriber, || log(&ImportNotes::default()));
        assert!(captured.text().is_empty());
    }
}
