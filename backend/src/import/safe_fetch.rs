//! The only way the API may fetch a user-supplied URL (SSRF guard, LNK-7).
//!
//! Per hop: http/https only; the host is resolved here and the hop is refused if ANY address is not global
//! ([`is_public_ip`]); the request then goes out on a fresh client pinned to exactly those addresses
//! (`resolve_to_addrs`), so a second DNS answer cannot swap in an internal IP. Redirects are followed by hand
//! (max 5) and every hop is vetted again. 15 s overall, bodies capped while streaming.
//! 401/403/429/503 and small bot-check pages are `site_blocked`; any other failure is `fetch_failed`.

use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Duration,
};

use reqwest::{StatusCode, header};
use url::{Host, Url};

use crate::error::{AppError, AppResult};

const TOTAL_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_REDIRECTS: usize = 5;
/// Page cap (5 MB).
pub const PAGE_MAX_BYTES: usize = 5 * 1024 * 1024;
/// Bot-check interstitials are small; a big page that mentions a captcha is a real page.
const BOT_PAGE_MAX_BYTES: usize = 100 * 1024;
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) \
                          Version/18.0 Safari/605.1.15";
const BOT_MARKERS: &[&str] = &[
    "just a moment...",
    "attention required! | cloudflare",
    "cf-browser-verification",
    "verify you are human",
    "captcha-delivery.com",
    "px-captcha",
    "are you a robot",
];

/// Which addresses may be fetched. The default allows public addresses only; there is no env var or request
/// field that changes it.
#[derive(Clone, Copy, Debug, Default)]
pub struct FetchPolicy {
    loopback_port: Option<u16>,
}

impl FetchPolicy {
    /// Tests only: additionally allows loopback on this one port (the local test server).
    #[doc(hidden)]
    pub fn allow_loopback_port_for_tests(port: u16) -> Self {
        Self {
            loopback_port: Some(port),
        }
    }

    fn allows(&self, addr: SocketAddr) -> bool {
        (addr.ip().is_loopback() && Some(addr.port()) == self.loopback_port)
            || is_public_ip(addr.ip())
    }
}

/// A fetched page: final URL after redirects and the body (≤ the cap).
pub struct Fetched {
    pub final_url: Url,
    pub content_type: Option<String>,
    pub body: Vec<u8>,
}

/// Fetches `url` under the rules above; the body is at most `max_bytes`.
pub async fn fetch(policy: &FetchPolicy, url: &Url, max_bytes: usize) -> AppResult<Fetched> {
    tokio::time::timeout(TOTAL_TIMEOUT, follow(policy, url.clone(), max_bytes))
        .await
        .unwrap_or_else(|_| {
            Err(AppError::FetchFailed(
                "The site took too long to answer.".into(),
            ))
        })
}

async fn follow(policy: &FetchPolicy, mut url: Url, max_bytes: usize) -> AppResult<Fetched> {
    for _ in 0..=MAX_REDIRECTS {
        let mut resp = send(policy, &url).await?;
        let status = resp.status();
        if status.is_redirection() {
            let next = resp
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|loc| url.join(loc).ok())
                .ok_or_else(|| AppError::FetchFailed("The site sent a broken redirect.".into()))?;
            url = next;
            continue;
        }
        if matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::TOO_MANY_REQUESTS
                | StatusCode::SERVICE_UNAVAILABLE
        ) {
            return Err(blocked());
        }
        if !status.is_success() {
            return Err(AppError::FetchFailed(format!(
                "The site answered with an error ({}).",
                status.as_u16()
            )));
        }
        let too_large = || AppError::FetchFailed("That page is too large to import.".into());
        if resp.content_length().is_some_and(|n| n > max_bytes as u64) {
            return Err(too_large());
        }
        let content_type = resp
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let mut body = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|_| {
            AppError::FetchFailed("The connection broke while reading the page.".into())
        })? {
            if body.len() + chunk.len() > max_bytes {
                return Err(too_large());
            }
            body.extend_from_slice(&chunk);
        }
        let is_html = content_type
            .as_deref()
            .is_none_or(|c| c.to_ascii_lowercase().contains("html"));
        if is_html && body.len() <= BOT_PAGE_MAX_BYTES && looks_like_bot_check(&body) {
            return Err(blocked());
        }
        return Ok(Fetched {
            final_url: url,
            content_type,
            body,
        });
    }
    Err(AppError::FetchFailed("Too many redirects.".into()))
}

fn blocked() -> AppError {
    AppError::SiteBlocked("That site does not let us read its pages.".into())
}

fn looks_like_bot_check(body: &[u8]) -> bool {
    let text = String::from_utf8_lossy(body).to_lowercase();
    BOT_MARKERS.iter().any(|m| text.contains(m))
}

/// Vets `url`, then sends one GET pinned to the vetted addresses.
async fn send(policy: &FetchPolicy, url: &Url) -> AppResult<reqwest::Response> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::BlockedAddress);
    }
    let port = url
        .port_or_known_default()
        .ok_or(AppError::BlockedAddress)?;
    let (domain, addrs): (Option<String>, Vec<SocketAddr>) = match url.host() {
        None => return Err(AppError::BlockedAddress),
        Some(Host::Ipv4(ip)) => (None, vec![SocketAddr::new(ip.into(), port)]),
        Some(Host::Ipv6(ip)) => (None, vec![SocketAddr::new(ip.into(), port)]),
        Some(Host::Domain(d)) => {
            let found = tokio::net::lookup_host((d, port))
                .await
                .map_err(|_| AppError::FetchFailed("That address could not be found.".into()))?;
            (Some(d.to_string()), found.collect())
        }
    };
    if addrs.is_empty() {
        return Err(AppError::FetchFailed(
            "That address could not be found.".into(),
        ));
    }
    if addrs.iter().any(|a| !policy.allows(*a)) {
        return Err(AppError::BlockedAddress);
    }
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
        ),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        header::HeaderValue::from_static("en-US,en;q=0.9"),
    );
    // shortcut: one client per hop (a few ms) so the pin is per hop; share clients if imports get busy.
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy() // an env proxy would resolve names itself and bypass the guard
        .user_agent(USER_AGENT)
        .default_headers(headers);
    if let Some(d) = &domain {
        builder = builder.resolve_to_addrs(d, &addrs);
    }
    let client = builder.build().map_err(|e| AppError::Internal(e.into()))?;
    client
        .get(url.clone())
        .send()
        .await
        .map_err(|_| AppError::FetchFailed("Could not reach that site.".into()))
}

/// True only for globally routable unicast addresses.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0                                   // "this network", unspecified
        || a == 10                             // RFC 1918
        || (a == 100 && (64..128).contains(&b)) // CGNAT
        || a == 127                            // loopback
        || (a == 169 && b == 254)              // link-local, cloud metadata
        || (a == 172 && (16..32).contains(&b)) // RFC 1918
        || (a == 192 && b == 0 && c == 0)      // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2)      // documentation
        || (a == 192 && b == 88 && c == 99)    // 6to4 relay
        || (a == 192 && b == 168)              // RFC 1918
        || (a == 198 && (b == 18 || b == 19))  // benchmarking
        || (a == 198 && b == 51 && c == 100)   // documentation
        || (a == 203 && b == 0 && c == 113)    // documentation
        || a >= 224) // multicast, reserved, broadcast
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    // ::ffff:a.b.c.d is judged as the IPv4 address it wraps.
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_public_v4(v4);
    }
    // ::/96 (IPv4-compatible, also :: and ::1) never carries real traffic.
    if s[..6].iter().all(|&x| x == 0) {
        return false;
    }
    let embedded = |hi: u16, lo: u16| Ipv4Addr::from(((hi as u32) << 16) | lo as u32);
    if s[0] == 0x64 && s[1] == 0xff9b && s[2..6].iter().all(|&x| x == 0) {
        return is_public_v4(embedded(s[6], s[7])); // NAT64
    }
    if s[0] == 0x2002 {
        return is_public_v4(embedded(s[1], s[2])); // 6to4
    }
    // Global unicast 2000::/3 only: drops fc00::/7, fe80::/10, fec0::/10, ff00::/8, 100::/64 and the rest.
    if s[0] & 0xe000 != 0x2000 {
        return false;
    }
    // 2001::/23 special-purpose (Teredo, benchmarking, ORCHID), 2001:db8::/32 and 3fff::/20 documentation.
    !(s[0] == 0x2001 && (s[1] < 0x0200 || s[1] == 0x0db8) || s[0] == 0x3fff && s[1] < 0x1000)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public(s: &str) -> bool {
        is_public_ip(s.parse().unwrap())
    }

    #[test]
    fn public_addresses_pass() {
        for ip in [
            "8.8.8.8",
            "93.184.216.34",
            "172.32.0.1",
            "100.128.0.1",
            "2606:4700:4700::1111",
            "2001:4860:4860::8888",
            "::ffff:8.8.8.8",
            "64:ff9b::808:808",
        ] {
            assert!(public(ip), "{ip} should be public");
        }
    }

    #[test]
    fn non_global_v4_is_refused() {
        for ip in [
            "0.0.0.0",
            "0.1.2.3",
            "10.0.0.1",
            "100.64.0.1",
            "100.127.255.255",
            "127.0.0.1",
            "127.255.255.254",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.19.255.255",
            "198.51.100.7",
            "203.0.113.9",
            "224.0.0.1",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
        ] {
            assert!(!public(ip), "{ip} should be refused");
        }
    }

    #[test]
    fn non_global_v6_is_refused() {
        for ip in [
            "::",
            "::1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "fec0::1",
            "ff02::1",
            "100::1",
            "2001:db8::1",
            "2001::1",
            "2001:2::1",
            "3fff::1",
            "64:ff9b:1::1",
        ] {
            assert!(!public(ip), "{ip} should be refused");
        }
    }

    #[test]
    fn wrapped_v4_forms_are_refused() {
        for ip in [
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:192.168.0.1",
            "::127.0.0.1",
            "::8.8.8.8",
            "64:ff9b::7f00:1",
            "64:ff9b::a9fe:a9fe",
            "2002:7f00:1::1",
            "2002:c0a8:101::1",
        ] {
            assert!(!public(ip), "{ip} should be refused");
        }
    }

    #[tokio::test]
    async fn default_policy_refuses_internal_addresses() {
        let policy = FetchPolicy::default();
        for u in [
            "http://127.0.0.1/",
            "http://127.0.0.1:8080/x",
            "http://[::1]/",
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::ffff:127.0.0.1]/",
            "http://2130706433/",
            "http://0x7f.1/",
            "http://localhost/",
            "ftp://example.com/",
            "file:///etc/passwd",
        ] {
            let err = fetch(&policy, &Url::parse(u).unwrap(), 1000)
                .await
                .err()
                .unwrap_or_else(|| panic!("{u} was fetched"));
            assert!(matches!(err, AppError::BlockedAddress), "{u}: {err:?}");
        }
    }

    #[test]
    fn bot_pages_are_recognised() {
        assert!(looks_like_bot_check(
            b"<html><title>Just a moment...</title></html>"
        ));
        assert!(!looks_like_bot_check(
            b"<html><title>Pancakes</title></html>"
        ));
    }
}
