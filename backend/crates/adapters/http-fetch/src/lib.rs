//! Outbound page fetching behind [`ports::PageFetcher`] (LNK-7). Every request goes through [`safe_fetch`], the SSRF
//! guard; nothing else in the application opens a connection to a user-supplied address.

use std::time::Duration;

use async_trait::async_trait;
use domain::{DomainResult, url::Url};
use ports::{FetchedPage, PageFetcher};

pub mod safe_fetch;

pub use safe_fetch::{FetchPolicy, PAGE_MAX_BYTES, TOTAL_TIMEOUT, is_public_ip};

/// The [`PageFetcher`] for the real network: public addresses only, unless the policy says otherwise.
#[derive(Clone, Debug, Default)]
pub struct HttpPageFetcher {
    policy: FetchPolicy,
}

impl HttpPageFetcher {
    pub fn new(policy: FetchPolicy) -> Self {
        Self { policy }
    }

    /// The same fetcher under another policy.
    pub fn with_policy(&self, policy: FetchPolicy) -> Self {
        Self { policy }
    }
}

#[async_trait]
impl PageFetcher for HttpPageFetcher {
    async fn fetch(&self, url: &Url, max_bytes: usize) -> DomainResult<FetchedPage> {
        safe_fetch::fetch(&self.policy, url, max_bytes).await
    }

    fn budget(&self) -> Duration {
        self.policy.total_timeout()
    }
}
