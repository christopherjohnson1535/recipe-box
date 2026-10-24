//! The SSRF-guarded fetcher lives in `adapter_http_fetch`; these are the names the server and its tests use.

pub use adapter_http_fetch::{FetchPolicy, PAGE_MAX_BYTES, TOTAL_TIMEOUT, is_public_ip};
