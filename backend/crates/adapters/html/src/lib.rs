//! Reads recipes out of fetched web pages behind [`ports::PageReader`] (LNK-1/2/3): schema.org JSON-LD and microdata
//! in [`jsonld`], plain readable text for the AI fallback in [`readable`].

use std::time::Duration;

use async_trait::async_trait;
use domain::{DomainError, DomainResult};
use ports::{FetchedPage, PageContent, PageReader};

pub mod jsonld;
pub mod readable;

use readable::{MIN_PAGE_CHARS, readable};

/// The [`PageReader`] for HTML pages.
#[derive(Clone, Copy, Debug, Default)]
pub struct HtmlPageReader;

#[async_trait]
impl PageReader for HtmlPageReader {
    /// A page whose readable text has fewer than [`MIN_PAGE_CHARS`] non-whitespace characters is `Nothing`: there
    /// is not enough there for the AI to read.
    async fn read(
        &self,
        page: FetchedPage,
        want_text: bool,
        budget: Duration,
    ) -> DomainResult<PageContent> {
        // Parsing is CPU-bound: off the async workers, and inside the budget. On a timeout the blocking thread is
        // abandoned (the pre-checks in `jsonld` and `readable` bound how long it can run).
        let parse = tokio::task::spawn_blocking(move || {
            // shortcut: pages are decoded as UTF-8 (lossy); honour <meta charset> if a non-UTF-8 site turns up.
            let html = String::from_utf8_lossy(&page.body);
            if let Some(draft) = jsonld::extract(&html, &page.final_url) {
                return PageContent::Draft(Box::new(draft));
            }
            if !want_text {
                return PageContent::Nothing;
            }
            let text = readable(&html, &page.final_url);
            if text.text.chars().filter(|c| !c.is_whitespace()).count() < MIN_PAGE_CHARS {
                return PageContent::Nothing;
            }
            PageContent::Text {
                site_name: jsonld::site_name(&html, &page.final_url),
                text: text.text,
                image_url: text.image_url,
            }
        });
        tokio::time::timeout(budget, parse)
            .await
            .map_err(|_| DomainError::FetchFailed("That page took too long to read.".into()))?
            .map_err(DomainError::internal)
    }
}
