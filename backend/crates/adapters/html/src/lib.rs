//! Reads recipes out of fetched web pages behind [`ports::PageReader`] (LNK-1/2/3): schema.org JSON-LD and microdata
//! in [`jsonld`], plain readable text for the AI fallback in [`readable`].

use std::time::Duration;

use async_trait::async_trait;
use domain::{DomainError, DomainResult};
use ports::{FetchedPage, PageContent, PageReader};

pub mod jsonld;
pub mod readable;

use readable::readable;

/// The [`PageReader`] for HTML pages.
#[derive(Clone, Copy, Debug, Default)]
pub struct HtmlPageReader;

#[async_trait]
impl PageReader for HtmlPageReader {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn page(body: String) -> FetchedPage {
        FetchedPage {
            final_url: "https://example.com/soup".parse().unwrap(),
            content_type: Some("text/html".into()),
            body: body.into_bytes(),
        }
    }

    // A page near the tag cap takes the parser far longer than the 1 ms budget (the timeout under test, not a sleep).
    #[tokio::test]
    async fn a_parse_that_outlasts_the_budget_is_a_fetch_failure() {
        let html = format!("<body>{}</body>", "<p>Boil the water.</p>".repeat(50_000));
        let r = HtmlPageReader
            .read(page(html), true, Duration::from_millis(1))
            .await;
        assert!(
            matches!(&r, Err(DomainError::FetchFailed(m)) if m == "That page took too long to read."),
            "{:?}",
            r.err()
        );
    }

    #[tokio::test]
    async fn a_page_without_recipe_data_is_nothing_when_text_is_not_wanted() {
        let r = HtmlPageReader
            .read(page("<p>Hello</p>".into()), false, Duration::from_secs(5))
            .await;
        assert!(matches!(r, Ok(PageContent::Nothing)));
    }
}
