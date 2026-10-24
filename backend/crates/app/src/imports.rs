//! Recipe import: the pieces of it that need no I/O.

use async_trait::async_trait;
use domain::{AiProvider, DomainError, DomainResult, PhotoMode, RecipeDraft};
use ports::RecipeExtractor;

/// The extractor when `AI_PROVIDER=none`: every call is `AiDisabled`.
#[derive(Clone, Copy, Debug, Default)]
pub struct NoneExtractor;

#[async_trait]
impl RecipeExtractor for NoneExtractor {
    fn provider(&self) -> AiProvider {
        AiProvider::None
    }

    async fn extract_images(&self, _: &[Vec<u8>], _: PhotoMode) -> DomainResult<RecipeDraft> {
        Err(DomainError::AiDisabled)
    }

    async fn extract_text(&self, _: &str) -> DomainResult<RecipeDraft> {
        Err(DomainError::AiDisabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn every_call_is_ai_disabled() {
        let x = NoneExtractor;
        assert_eq!(x.provider(), AiProvider::None);
        assert!(matches!(
            x.extract_text("soup").await,
            Err(DomainError::AiDisabled)
        ));
        assert!(matches!(
            x.extract_images(&[], PhotoMode::Dish).await,
            Err(DomainError::AiDisabled)
        ));
    }
}
