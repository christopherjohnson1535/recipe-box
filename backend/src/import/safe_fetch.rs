//! The SSRF-guarded fetcher lives in `adapter_http_fetch`; the server and its tests only need the policy.

pub use adapter_http_fetch::FetchPolicy;
