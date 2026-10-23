//! AI recipe extraction from photos and text (PHO-2–6, LNK-3).
//!
//! [`AiProvider`] is the pluggable seam; [`Ai`] is the enum `AppState` holds (`None` or `Anthropic`), built by
//! [`Ai::from_config`]. [`AnthropicProvider`] calls the Messages API with one forced tool, `record_recipe`, so the
//! reply is structured. The reply is never trusted: [`coerce`] reads it leniently, trims, drops blanks, applies the
//! same limits the save endpoint enforces (so a draft always saves) and adds a warning for everything it cut.
//! Photos are shrunk to <= 1568 px before sending. One retry on 429, 5xx and connect errors (not on a timeout, and
//! not when `retry-after` asks for more than [`MAX_RETRY_AFTER_SECS`]). The API key (a [`Secret`]) and image data
//! are never logged.

use std::{future::Future, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

use crate::{
    config::{Config, Secret},
    error::{AppError, AppResult},
    models::{Ingredient, RecipeDraft, SourceType},
    validate,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhotoMode {
    /// A photo of a written/printed recipe.
    Recipe,
    /// A photo of the finished dish; the recipe is a guess.
    Dish,
}

pub trait AiProvider: Send + Sync {
    /// `images` are already-decoded JPEG bytes, in page order.
    fn recipe_from_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> impl Future<Output = AppResult<RecipeDraft>> + Send;

    fn recipe_from_text(&self, text: &str) -> impl Future<Output = AppResult<RecipeDraft>> + Send;
}

/// `AI_PROVIDER=none`: every call is 422 `ai_disabled`.
pub struct NoneProvider;

impl AiProvider for NoneProvider {
    async fn recipe_from_images(&self, _: &[Vec<u8>], _: PhotoMode) -> AppResult<RecipeDraft> {
        Err(AppError::AiDisabled)
    }

    async fn recipe_from_text(&self, _: &str) -> AppResult<RecipeDraft> {
        Err(AppError::AiDisabled)
    }
}

/// The configured provider; `AppState::ai`.
pub enum Ai {
    None(NoneProvider),
    Anthropic(AnthropicProvider),
}

impl Ai {
    pub fn from_config(config: &Config) -> anyhow::Result<Self> {
        match (config.ai_provider.as_str(), &config.anthropic_api_key) {
            ("anthropic", Some(key)) => Ok(Self::Anthropic(AnthropicProvider::new(
                key.clone(),
                config.ai_model.clone(),
            )?)),
            ("anthropic", None) => anyhow::bail!("AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY"),
            _ => Ok(Self::None(NoneProvider)),
        }
    }
}

impl AiProvider for Ai {
    async fn recipe_from_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> AppResult<RecipeDraft> {
        match self {
            Self::None(p) => p.recipe_from_images(images, mode).await,
            Self::Anthropic(p) => p.recipe_from_images(images, mode).await,
        }
    }

    async fn recipe_from_text(&self, text: &str) -> AppResult<RecipeDraft> {
        match self {
            Self::None(p) => p.recipe_from_text(text).await,
            Self::Anthropic(p) => p.recipe_from_text(text).await,
        }
    }
}

// ---------- Anthropic ----------

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const TOOL: &str = "record_recipe";
/// Anthropic downsizes anything larger than this anyway.
const MAX_IMAGE_EDGE: u32 = 1568;
/// A `retry-after` longer than this is not waited for; the caller gets "busy" at once.
const MAX_RETRY_AFTER_SECS: u64 = 10;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120); // vision replies are slow
const MAX_TEXT_INPUT_CHARS: usize = 50_000;
const MAX_MODEL_WARNINGS: usize = 10;
const MAX_WARNING_CHARS: usize = 300;
/// Durations above a week are nonsense for a recipe (same limit as `jsonld`).
const MAX_MINUTES: f64 = 7.0 * 24.0 * 60.0;
const MAX_TAGS: usize = 15;
const MAX_TAG_CHARS: usize = 40;
const MAX_SERVINGS_CHARS: usize = 100;
const MAX_SECTION_CHARS: usize = 200;
const DISH_WARNING: &str = "Guessed from a photo of the dish";
const CUT_SHORT: &str = "The recipe may be cut short; check the end.";
const NO_RECIPE: &str = "We couldn't find a recipe in that.";

const SYSTEM_RECIPE: &str = "You read recipes for a household recipe box. Transcribe the recipe faithfully, in the \
original wording and order. Keep section headings (for example \"For the sauce\") in each line's `section`. Do not \
invent quantities, times or steps that the source does not give. Put anything you were unsure about in `warnings`. \
If there is no recipe in the input, set found=false. Always answer by calling the record_recipe tool.";
const SYSTEM_DISH: &str = "You help a household recipe box. The photo shows a finished dish, not a written recipe. \
Suggest a likely recipe for the dish shown, with realistic ingredients and steps, and a short title. Always answer by \
calling the record_recipe tool. If the photo does not show food, set found=false.";

pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: Secret,
    model: String,
    base_url: String,
    /// Upper bound for the pause before the retry; tests set it to zero.
    retry_delay_cap: Duration,
    /// Whole-request timeout; tests set it to a few milliseconds.
    request_timeout: Duration,
}

/// Why one attempt failed; `retry` says whether a second attempt makes sense.
struct Failure {
    err: AppError,
    retry: bool,
    retry_after: Option<u64>,
}

fn unreadable() -> AppError {
    AppError::AiError("The AI service sent a reply we could not read.".into())
}

/// How long to pause before the single retry; `None` means do not retry (the server asked for more than
/// [`MAX_RETRY_AFTER_SECS`]). Never longer than `cap`.
fn retry_wait(retry_after: Option<u64>, cap: Duration) -> Option<Duration> {
    let wait = match retry_after {
        Some(s) if s > MAX_RETRY_AFTER_SECS => return None,
        Some(s) => Duration::from_secs(s),
        None => Duration::from_secs(1),
    };
    Some(wait.min(cap))
}

impl Failure {
    fn new(msg: &str, retry: bool) -> Self {
        Self {
            err: AppError::AiError(msg.into()),
            retry,
            retry_after: None,
        }
    }
}

impl AnthropicProvider {
    pub fn new(api_key: Secret, model: String) -> anyhow::Result<Self> {
        Self::with_base_url(api_key, model, DEFAULT_BASE_URL)
    }

    /// `base_url` has no trailing path (`http://127.0.0.1:1234`); tests point it at a local mock.
    pub fn with_base_url(api_key: Secret, model: String, base_url: &str) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("RecipeBox/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            client,
            api_key,
            model,
            base_url: base_url.trim_end_matches('/').to_string(),
            retry_delay_cap: Duration::from_secs(MAX_RETRY_AFTER_SECS),
            request_timeout: REQUEST_TIMEOUT,
        })
    }

    /// Caps the pause before the single retry (tests pass `Duration::ZERO`).
    pub fn with_retry_delay_cap(mut self, cap: Duration) -> Self {
        self.retry_delay_cap = cap;
        self
    }

    /// Overrides the 120 s whole-request timeout (tests only need milliseconds).
    pub fn with_request_timeout(mut self, timeout: Duration) -> Self {
        self.request_timeout = timeout;
        self
    }

    /// Sends `content` as the user turn and returns the `record_recipe` input, coerced into a draft.
    async fn extract(
        &self,
        system: &str,
        content: Vec<Value>,
        source: SourceType,
        dish: bool,
    ) -> AppResult<RecipeDraft> {
        let body = json!({
            "model": self.model,
            "max_tokens": 8192,
            "system": system,
            "tools": [tool_definition()],
            "tool_choice": { "type": "tool", "name": TOOL },
            "messages": [{ "role": "user", "content": content }],
        });
        let reply = self.send_with_retry(&body).await?;
        let max_tokens = reply["stop_reason"] == "max_tokens";
        let input = reply["content"]
            .as_array()
            .and_then(|blocks| {
                blocks
                    .iter()
                    .find(|b| b["type"] == "tool_use" && b["name"] == TOOL)
            })
            .map(|b| &b["input"])
            .filter(|i| i.is_object())
            .ok_or_else(|| {
                tracing::warn!("anthropic reply had no usable {TOOL} block");
                unreadable()
            })?;
        if !max_tokens {
            return coerce(input, source, dish);
        }
        // The reply was cut off mid tool call: keep it only if it is still a usable draft.
        match coerce(input, source, dish) {
            Ok(mut draft) => {
                warn(&mut draft.warnings, CUT_SHORT);
                Ok(draft)
            }
            Err(_) => {
                tracing::warn!("anthropic reply hit max_tokens and was not usable");
                Err(unreadable())
            }
        }
    }

    async fn send_with_retry(&self, body: &Value) -> AppResult<Value> {
        let mut failure = match self.send_once(body).await {
            Ok(v) => return Ok(v),
            Err(f) => f,
        };
        if let Some(wait) = failure
            .retry
            .then(|| retry_wait(failure.retry_after, self.retry_delay_cap))
            .flatten()
        {
            tokio::time::sleep(wait).await;
            match self.send_once(body).await {
                Ok(v) => return Ok(v),
                Err(f) => failure = f,
            }
        }
        Err(failure.err)
    }

    async fn send_once(&self, body: &Value) -> Result<Value, Failure> {
        // Trimmed: a key copied with a stray newline or `\r` is not a valid header value.
        let mut key = reqwest::header::HeaderValue::from_str(self.api_key.expose().trim())
            .map_err(|_| {
                tracing::error!(
                    "ANTHROPIC_API_KEY contains characters that cannot be sent in a header"
                );
                Failure::new(
                    "The AI service rejected the API key. Check ANTHROPIC_API_KEY.",
                    false,
                )
            })?;
        key.set_sensitive(true);
        let res = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .timeout(self.request_timeout)
            .json(body)
            .send()
            .await
            .map_err(|e| {
                if e.is_builder() {
                    tracing::error!("could not build the anthropic request (check AI settings)");
                }
                tracing::warn!(
                    timeout = e.is_timeout(),
                    connect = e.is_connect(),
                    "anthropic request failed to complete"
                );
                // A timeout means the server was working on it; retrying would only double the wait.
                Failure::new(
                    "The AI service did not answer in time. Try again.",
                    e.is_connect(),
                )
            })?;
        let status = res.status();
        let request_id = res
            .headers()
            .get("request-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let json: Option<Value> = res.json().await.ok();
        if status.is_success() {
            return json.ok_or_else(|| Failure {
                err: unreadable(),
                retry: false,
                retry_after: None,
            });
        }
        let error_type = json
            .as_ref()
            .and_then(|j| j["error"]["type"].as_str())
            .unwrap_or("");
        // Anthropic error messages describe the problem, never the key.
        let error_message: String = json
            .as_ref()
            .and_then(|j| j["error"]["message"].as_str())
            .unwrap_or("")
            .chars()
            .take(300)
            .collect();
        tracing::warn!(
            status = status.as_u16(),
            request_id,
            error_type,
            error_message,
            "anthropic request failed"
        );
        let code = status.as_u16();
        Err(match code {
            401 | 403 => Failure::new(
                "The AI service rejected the API key. Check ANTHROPIC_API_KEY.",
                false,
            ),
            404 => Failure::new(
                "The AI model name was not recognised. Check AI_MODEL.",
                false,
            ),
            429 | 500..=599 => Failure {
                retry: true,
                retry_after,
                ..Failure::new("The AI service is busy. Try again in a minute.", true)
            },
            _ => Failure::new("The AI service could not read this request.", false),
        })
    }
}

impl AiProvider for AnthropicProvider {
    async fn recipe_from_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> AppResult<RecipeDraft> {
        let mut content = Vec::with_capacity(images.len() + 1);
        for img in images {
            let img = img.clone();
            let jpeg = tokio::task::spawn_blocking(move || shrink(&img))
                .await
                .map_err(|e| AppError::Internal(e.into()))??;
            content.push(json!({
                "type": "image",
                "source": { "type": "base64", "media_type": "image/jpeg", "data": STANDARD.encode(jpeg) },
            }));
        }
        let (system, ask) = match mode {
            PhotoMode::Recipe => (
                SYSTEM_RECIPE,
                "Transcribe the recipe on these pages (in order).",
            ),
            PhotoMode::Dish => (
                SYSTEM_DISH,
                "Suggest a likely recipe for the dish in this photo.",
            ),
        };
        content.push(json!({ "type": "text", "text": ask }));
        self.extract(system, content, SourceType::Photo, mode == PhotoMode::Dish)
            .await
    }

    async fn recipe_from_text(&self, text: &str) -> AppResult<RecipeDraft> {
        let text: String = text.chars().take(MAX_TEXT_INPUT_CHARS).collect();
        let content = vec![
            json!({ "type": "text", "text": format!("Extract the recipe from this text:\n\n{text}") }),
        ];
        self.extract(SYSTEM_RECIPE, content, SourceType::Text, false)
            .await
    }
}

/// JPEG bytes with the long edge at most [`MAX_IMAGE_EDGE`]; smaller images pass through untouched.
fn shrink(bytes: &[u8]) -> AppResult<Vec<u8>> {
    let img = image::load_from_memory(bytes).map_err(|e| AppError::Internal(e.into()))?;
    if img.width().max(img.height()) <= MAX_IMAGE_EDGE {
        return Ok(bytes.to_vec());
    }
    let small = img.resize(
        MAX_IMAGE_EDGE,
        MAX_IMAGE_EDGE,
        image::imageops::FilterType::Lanczos3,
    );
    let mut out = Vec::new();
    small
        .to_rgb8()
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut out, 85,
        ))
        .map_err(|e| AppError::Internal(e.into()))?;
    Ok(out)
}

fn tool_definition() -> Value {
    let lines = json!({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "text": { "type": "string" },
                "section": { "type": ["string", "null"], "description": "Heading the line sits under, or null." },
            },
            "required": ["text", "section"],
        },
    });
    json!({
        "name": TOOL,
        "description": "Record the recipe found in the input.",
        "input_schema": {
            "type": "object",
            "properties": {
                "found": { "type": "boolean", "description": "False when the input contains no recipe." },
                "title": { "type": "string" },
                "description": { "type": "string" },
                "ingredients": lines,
                "steps": lines,
                "servings": { "type": ["string", "null"], "description": "As written, e.g. \"4\" or \"Makes 12\"." },
                "prepMinutes": { "type": ["integer", "null"] },
                "cookMinutes": { "type": ["integer", "null"] },
                "totalMinutes": { "type": ["integer", "null"] },
                "notes": { "type": "string" },
                "tags": { "type": "array", "items": { "type": "string" } },
                "warnings": { "type": "array", "items": { "type": "string" }, "description": "Anything unclear or unreadable." },
            },
            "required": ["found", "title", "ingredients", "steps"],
        },
    })
}

// ---------- coercion of the model's reply ----------

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// `s` cut to `max` characters; true when something was cut.
fn cut(s: &mut String, max: usize) -> bool {
    match s.char_indices().nth(max) {
        Some((i, _)) => {
            s.truncate(i);
            true
        }
        None => false,
    }
}

fn warn(warnings: &mut Vec<String>, msg: &str) {
    if !warnings.iter().any(|w| w == msg) {
        warnings.push(msg.to_string());
    }
}

/// A string field, trimmed; keeps line breaks (`description`, `notes`) and cuts at `max` characters.
fn text(v: &Value, key: &str, max: usize, w: &mut Vec<String>) -> String {
    let mut s = v[key].as_str().unwrap_or("").trim().to_string();
    if cut(&mut s, max) {
        warn(w, "Some very long text was cut short.");
    }
    s
}

fn lines(v: &Value, what: &str, w: &mut Vec<String>) -> Vec<Ingredient> {
    let mut out = Vec::new();
    for item in v.as_array().into_iter().flatten() {
        // A bare string is as good as {text}.
        let (raw, section) = match item {
            Value::String(s) => (s.as_str(), None),
            Value::Object(_) => (
                item["text"].as_str().unwrap_or(""),
                item["section"].as_str(),
            ),
            _ => continue,
        };
        let mut text = collapse(raw);
        if text.is_empty() {
            continue;
        }
        if out.len() >= validate::MAX_LINES {
            warn(
                w,
                &format!("Some {what} were left out because there were too many."),
            );
            break;
        }
        if cut(&mut text, validate::MAX_LINE) {
            warn(w, "Some very long text was cut short.");
        }
        let mut section = section.map(collapse).filter(|s| !s.is_empty());
        if let Some(s) = &mut section {
            cut(s, MAX_SECTION_CHARS);
        }
        out.push(Ingredient { text, section });
    }
    out
}

/// A whole number of minutes from a number or a numeric string; anything else is `None`.
fn minutes(v: &Value, key: &str, w: &mut Vec<String>) -> Option<i32> {
    let n = match &v[key] {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => return None,
    };
    match n {
        Some(0.0) => None,
        Some(n) if n.is_finite() && (0.0..=MAX_MINUTES).contains(&n) => {
            Some(n.round().max(1.0) as i32)
        }
        _ => {
            warn(w, "A cooking time was not believable and was left out.");
            None
        }
    }
}

fn servings(v: &Value) -> Option<String> {
    let mut s = match &v["servings"] {
        Value::String(s) => collapse(s),
        Value::Number(n) => n.to_string(),
        _ => return None,
    };
    cut(&mut s, MAX_SERVINGS_CHARS);
    (!s.is_empty()).then_some(s)
}

/// Turns the `record_recipe` input into a draft. Never panics on odd shapes; `NoRecipeFound` when `found` is false
/// or there are no ingredients and no steps.
fn coerce(input: &Value, source: SourceType, dish: bool) -> AppResult<RecipeDraft> {
    let no_recipe = || AppError::NoRecipeFound(NO_RECIPE.into());
    if input["found"] == Value::Bool(false) {
        return Err(no_recipe());
    }
    let mut notes = Vec::new();
    let ingredients = lines(&input["ingredients"], "ingredients", &mut notes);
    let steps = lines(&input["steps"], "steps", &mut notes);
    if ingredients.is_empty() && steps.is_empty() {
        return Err(no_recipe());
    }
    let mut title = collapse(input["title"].as_str().unwrap_or(""));
    if title.is_empty() {
        title = "Untitled recipe".into();
        warn(
            &mut notes,
            "No title was found, so this one is called Untitled recipe.",
        );
    } else if cut(&mut title, validate::MAX_TITLE) {
        warn(&mut notes, "Some very long text was cut short.");
    }
    let tag_src: Vec<String> = input["tags"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|t| t.as_str().map(str::to_string))
        .collect();
    let tags = validate::tags(&tag_src)
        .into_iter()
        .filter(|t| t.chars().count() <= MAX_TAG_CHARS)
        .take(MAX_TAGS)
        .collect();
    let mut draft = RecipeDraft {
        description: text(input, "description", validate::MAX_DESCRIPTION, &mut notes),
        notes: text(input, "notes", validate::MAX_NOTES, &mut notes),
        servings: servings(input),
        prep_minutes: minutes(input, "prepMinutes", &mut notes),
        cook_minutes: minutes(input, "cookMinutes", &mut notes),
        total_minutes: minutes(input, "totalMinutes", &mut notes),
        title,
        ingredients,
        steps,
        tags,
        source_type: source,
        ..Default::default()
    };
    draft.warnings = notes;
    for w in input["warnings"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(collapse)
        .filter(|w| !w.is_empty())
        .take(MAX_MODEL_WARNINGS)
    {
        let mut w = w;
        cut(&mut w, MAX_WARNING_CHARS);
        warn(&mut draft.warnings, &w);
    }
    if dish {
        draft.warnings.push(DISH_WARNING.into());
    }
    Ok(draft)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_wait_rules() {
        let cap = Duration::from_secs(10);
        let s = Duration::from_secs;
        assert_eq!(retry_wait(Some(3), cap), Some(s(3)));
        assert_eq!(retry_wait(Some(10), cap), Some(s(10)));
        assert_eq!(retry_wait(Some(60), cap), None);
        assert_eq!(retry_wait(None, cap), Some(s(1)));
        assert_eq!(retry_wait(Some(3), Duration::ZERO), Some(Duration::ZERO));
    }

    fn ok(v: Value, dish: bool) -> RecipeDraft {
        coerce(&v, SourceType::Photo, dish).unwrap()
    }

    #[test]
    fn happy_path_trims_and_drops_blanks() {
        let d = ok(
            json!({
                "found": true, "title": "  Pancakes ", "description": " Fluffy. ",
                "ingredients": [{"text": "  1 cup   flour ", "section": " Dry "}, {"text": "   "}, "2 eggs", 7, null],
                "steps": [{"text": "Mix.", "section": null}, {"text": ""}],
                "servings": 4, "prepMinutes": "10", "cookMinutes": 15.4, "totalMinutes": null,
                "tags": ["Breakfast", "breakfast", " "], "warnings": ["Hard to read", "  "],
            }),
            false,
        );
        assert_eq!(d.title, "Pancakes");
        assert_eq!(d.description, "Fluffy.");
        let ing: Vec<_> = d
            .ingredients
            .iter()
            .map(|i| (i.text.as_str(), i.section.as_deref()))
            .collect();
        assert_eq!(ing, [("1 cup flour", Some("Dry")), ("2 eggs", None)]);
        assert_eq!(d.steps.len(), 1);
        assert_eq!(d.servings.as_deref(), Some("4"));
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(10), Some(15), None)
        );
        assert_eq!(d.tags, ["breakfast"]);
        assert_eq!(d.warnings, ["Hard to read"]);
        assert_eq!(d.source_type, SourceType::Photo);
    }

    #[test]
    fn bad_minutes_are_dropped_with_one_warning() {
        let d = ok(
            json!({"title": "x", "steps": ["a"], "prepMinutes": -5, "cookMinutes": 1e9, "totalMinutes": "soon"}),
            false,
        );
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (None, None, None)
        );
        assert_eq!(d.warnings.len(), 1);
    }

    #[test]
    fn caps_warn() {
        let many: Vec<_> = (0..validate::MAX_LINES + 5)
            .map(|i| json!({"text": format!("i{i}")}))
            .collect();
        let d = ok(
            json!({"title": "t".repeat(400), "ingredients": many, "steps": [{"text": "s".repeat(3000)}],
                   "tags": (0..30).map(|i| format!("tag{i}")).collect::<Vec<_>>(),
                   "warnings": (0..20).map(|i| format!("w{i}")).collect::<Vec<_>>()}),
            false,
        );
        assert_eq!(d.title.chars().count(), validate::MAX_TITLE);
        assert_eq!(d.ingredients.len(), validate::MAX_LINES);
        assert_eq!(d.steps[0].text.chars().count(), validate::MAX_LINE);
        assert_eq!(d.tags.len(), MAX_TAGS);
        assert!(d.warnings.iter().any(|w| w.contains("too many")));
        assert!(d.warnings.iter().any(|w| w.contains("cut short")));
        assert_eq!(d.warnings.len(), 2 + MAX_MODEL_WARNINGS);
    }

    #[test]
    fn long_warning_is_cut() {
        let d = ok(
            json!({"title": "t", "steps": ["a"], "warnings": ["w".repeat(1000)]}),
            false,
        );
        assert_eq!(d.warnings[0].chars().count(), MAX_WARNING_CHARS);
    }

    #[test]
    fn untitled_gets_a_warning() {
        let d = ok(json!({"title": " ", "ingredients": ["salt"]}), false);
        assert_eq!(d.title, "Untitled recipe");
        assert_eq!(d.warnings.len(), 1);
    }

    #[test]
    fn dish_warning_is_last() {
        let d = ok(
            json!({"title": "t", "steps": ["a"], "warnings": ["hm"]}),
            true,
        );
        assert_eq!(d.warnings, ["hm", "Guessed from a photo of the dish"]);
    }

    #[test]
    fn nothing_usable_is_no_recipe() {
        for v in [
            json!({"found": false, "title": "x", "ingredients": ["a"]}),
            json!({"title": "Only a title"}),
            json!({"ingredients": "not a list", "steps": 5}),
            json!("a string"),
            json!({"ingredients": [{"text": " "}], "steps": [[]]}),
        ] {
            let err = coerce(&v, SourceType::Text, false).unwrap_err();
            assert!(matches!(err, AppError::NoRecipeFound(_)), "{v}");
        }
    }
}
