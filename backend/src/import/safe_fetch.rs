//! The only way the API may fetch a user-supplied URL (SSRF guard). Owned by the link-import issue (LNK-1).
//!
//! The implementation must:
//! - accept only `http`/`https` URLs on ports 80/443 (or the URL's explicit port if the issue decides so);
//! - resolve the host itself and refuse any non-public address — loopback, private (RFC 1918), link-local,
//!   CGNAT (100.64/10), unique-local/site-local IPv6, multicast, unspecified, IPv4-mapped forms of these —
//!   returning [`AppError::BlockedAddress`]; connect to the vetted IP (no second DNS lookup) so DNS rebinding
//!   cannot swap it;
//! - follow redirects manually (the shared client in `AppState::http` has redirects off), at most 5 hops,
//!   re-checking every hop;
//! - enforce the 15 s timeout (set on the client) and a 5 MB body cap while streaming;
//! - map 401/403/429/503 or an obvious bot-check page to [`AppError::SiteBlocked`], everything else that fails
//!   (DNS, timeout, too large, other status) to [`AppError::FetchFailed`];
//! - have unit tests for the address classifier.

use url::Url;

use crate::error::{AppError, AppResult};

/// A fetched page: final URL after redirects and the body (≤ 5 MB).
pub struct Fetched {
    pub final_url: Url,
    pub content_type: Option<String>,
    pub body: Vec<u8>,
}

/// Fetches `url` under the rules above.
pub async fn fetch(_client: &reqwest::Client, _url: &Url) -> AppResult<Fetched> {
    Err(AppError::NotImplemented(
        "Link import is not built yet.".into(),
    ))
}
