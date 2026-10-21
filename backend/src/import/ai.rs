//! AI recipe extraction from photos and text. Owned by the photo-import / text-import issues (PHO-2–6, LNK-3/4).
//!
//! The feature issue must:
//! - add `AnthropicProvider` (Messages API via `AppState::http`, key from `Config::anthropic_api_key`, model from
//!   `Config::ai_model`), sending images resized to ≤ 1568 px long edge and asking for JSON that matches
//!   [`RecipeDraft`] (validate the reply; never trust it as-is);
//! - choose the provider from `Config::ai_provider` (`none` → [`NoneProvider`]);
//! - in [`PhotoMode::Dish`], add the warning "Guessed from a photo of the dish";
//! - keep API keys out of logs and responses.

use std::future::Future;

use crate::{
    error::{AppError, AppResult},
    models::RecipeDraft,
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
