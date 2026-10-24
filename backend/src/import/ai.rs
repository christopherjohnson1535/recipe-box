//! Provider selection for AI recipe extraction (PHO-2–6, LNK-3): server wiring.
//!
//! [`Ai`] is the enum `AppState` holds (`None` or `Anthropic`), built by [`Ai::from_config`]; it is a
//! [`ports::RecipeExtractor`]. The extractors themselves live in `app` ([`app::NoneExtractor`]) and the Anthropic
//! adapter. [`AiProvider`] is a compatibility view over any extractor, answering with the API's `AppError` and
//! `RecipeDraft` types.

use std::future::Future;

use app::NoneExtractor;
use async_trait::async_trait;
use domain::{AiProvider as Provider, DomainResult};
use ports::RecipeExtractor;

pub use adapter_anthropic::AnthropicProvider;
pub use domain::{MAX_TEXT_INPUT_CHARS, PhotoMode};

use crate::{config::Config, error::AppResult, models::RecipeDraft};

/// The configured provider; `AppState::ai`.
pub enum Ai {
    None(NoneExtractor),
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
            _ => Ok(Self::None(NoneExtractor)),
        }
    }

    fn inner(&self) -> &dyn RecipeExtractor {
        match self {
            Self::None(p) => p,
            Self::Anthropic(p) => p,
        }
    }
}

#[async_trait]
impl RecipeExtractor for Ai {
    fn provider(&self) -> Provider {
        self.inner().provider()
    }

    async fn extract_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> DomainResult<domain::RecipeDraft> {
        self.inner().extract_images(images, mode).await
    }

    async fn extract_text(&self, text: &str) -> DomainResult<domain::RecipeDraft> {
        self.inner().extract_text(text).await
    }
}

/// Any [`RecipeExtractor`], answering with the API's types. A seam for the integration tests only (they call
/// `recipe_from_text` on the provider); production code uses [`RecipeExtractor`]. Do not build on it.
pub trait AiProvider: Send + Sync {
    /// `images` are already-decoded JPEG bytes, in page order.
    fn recipe_from_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> impl Future<Output = AppResult<RecipeDraft>> + Send;

    fn recipe_from_text(&self, text: &str) -> impl Future<Output = AppResult<RecipeDraft>> + Send;
}

impl<T: RecipeExtractor + ?Sized> AiProvider for T {
    async fn recipe_from_images(
        &self,
        images: &[Vec<u8>],
        mode: PhotoMode,
    ) -> AppResult<RecipeDraft> {
        Ok(self.extract_images(images, mode).await?.into())
    }

    async fn recipe_from_text(&self, text: &str) -> AppResult<RecipeDraft> {
        Ok(self.extract_text(text).await?.into())
    }
}
