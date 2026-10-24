//! The only way the application may fetch a user-supplied URL (SSRF guard, LNK-7).
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

use domain::{DomainError, DomainResult};
use ports::FetchedPage;

pub const TOTAL_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_REDIRECTS: usize = 5;
pub use domain::PAGE_MAX_BYTES;
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

/// Which addresses may be fetched. The default allows public addresses only. The one operator opt-in is
/// `IMPORT_ALLOW_HOST` (test stacks only; `main` refuses it together with `COOKIE_SECURE=true`); no request field
/// changes the policy.
#[derive(Clone, Debug, Default)]
pub struct FetchPolicy {
    loopback_port: Option<u16>,
    timeout: Option<Duration>,
    /// Operator opt-in (`IMPORT_ALLOW_HOST`, for end-to-end test stacks): this one host and port is fetched even
    /// though it is not public. Matched on the URL's host text, so it is re-checked on every redirect hop.
    allowed_host: Option<(String, u16)>,
}

impl FetchPolicy {
    /// Parses `host:port` (as in `IMPORT_ALLOW_HOST`). `None` for an empty value; `Err` if it is not `host:port`.
    pub fn with_allowed_host(mut self, value: &str) -> Result<Self, String> {
        let value = value.trim();
        if value.is_empty() {
            return Ok(self);
        }
        let bad = || format!("IMPORT_ALLOW_HOST must be host:port, got `{value}`");
        let (host, port) = value.rsplit_once(':').ok_or_else(bad)?;
        let port: u16 = port.parse().map_err(|_| bad())?;
        if host.is_empty() || host.contains(['/', '@', '[', ']', ':']) {
            return Err(bad());
        }
        self.allowed_host = Some((host.to_ascii_lowercase(), port));
        Ok(self)
    }

    fn exempts(&self, url: &Url, port: u16) -> bool {
        self.allowed_host.as_ref().is_some_and(|(h, p)| {
            *p == port && url.host_str().is_some_and(|u| u.eq_ignore_ascii_case(h))
        })
    }

    /// Tests only: additionally allows loopback on this one port (the local test server).
    #[doc(hidden)]
    pub fn allow_loopback_port_for_tests(port: u16) -> Self {
        Self {
            loopback_port: Some(port),
            timeout: None,
            allowed_host: None,
        }
    }

    /// Tests only: a shorter overall budget so timeout tests stay quick.
    #[doc(hidden)]
    pub fn with_timeout_for_tests(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// The overall budget for one import request's fetching and page parsing.
    pub fn total_timeout(&self) -> Duration {
        self.timeout.unwrap_or(TOTAL_TIMEOUT)
    }

    fn allows(&self, addr: SocketAddr) -> bool {
        (addr.ip().is_loopback() && Some(addr.port()) == self.loopback_port)
            || is_public_ip(addr.ip())
    }
}

/// Fetches `url` under the rules above; the body is at most `max_bytes`.
pub async fn fetch(policy: &FetchPolicy, url: &Url, max_bytes: usize) -> DomainResult<FetchedPage> {
    tokio::time::timeout(
        policy.total_timeout(),
        follow(policy, url.clone(), max_bytes),
    )
    .await
    .unwrap_or_else(|_| {
        Err(DomainError::FetchFailed(
            "The site took too long to answer.".into(),
        ))
    })
}

async fn follow(policy: &FetchPolicy, mut url: Url, max_bytes: usize) -> DomainResult<FetchedPage> {
    for _ in 0..=MAX_REDIRECTS {
        let mut resp = send(policy, &url).await?;
        let status = resp.status();
        if status.is_redirection() {
            let next = resp
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|loc| url.join(loc).ok())
                .ok_or_else(|| {
                    DomainError::FetchFailed("The site sent a broken redirect.".into())
                })?;
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
            return Err(DomainError::FetchFailed(format!(
                "The site answered with an error ({}).",
                status.as_u16()
            )));
        }
        let too_large = || DomainError::FetchFailed("That page is too large to import.".into());
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
            DomainError::FetchFailed("The connection broke while reading the page.".into())
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
        return Ok(FetchedPage {
            final_url: url,
            content_type,
            body,
        });
    }
    Err(DomainError::FetchFailed("Too many redirects.".into()))
}

fn blocked() -> DomainError {
    DomainError::SiteBlocked("That site does not let us read its pages.".into())
}

fn looks_like_bot_check(body: &[u8]) -> bool {
    let text = String::from_utf8_lossy(body).to_lowercase();
    BOT_MARKERS.iter().any(|m| text.contains(m))
}

/// Vets `url`, then sends one GET pinned to the vetted addresses.
async fn send(policy: &FetchPolicy, url: &Url) -> DomainResult<reqwest::Response> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err(DomainError::BlockedAddress);
    }
    let port = url
        .port_or_known_default()
        .ok_or(DomainError::BlockedAddress)?;
    let (domain, addrs): (Option<String>, Vec<SocketAddr>) = match url.host() {
        None => return Err(DomainError::BlockedAddress),
        Some(Host::Ipv4(ip)) => (None, vec![SocketAddr::new(ip.into(), port)]),
        Some(Host::Ipv6(ip)) => (None, vec![SocketAddr::new(ip.into(), port)]),
        Some(Host::Domain(d)) => {
            let found = tokio::net::lookup_host((d, port))
                .await
                .map_err(|_| DomainError::FetchFailed("That address could not be found.".into()))?;
            (Some(d.to_string()), found.collect())
        }
    };
    if addrs.is_empty() {
        return Err(DomainError::FetchFailed(
            "That address could not be found.".into(),
        ));
    }
    let exempt = policy.exempts(url, port);
    if addrs
        .iter()
        .any(|a| !policy.allows(*a) && !(exempt && !never_exempt(a.ip())))
    {
        return Err(DomainError::BlockedAddress);
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
    let client = builder
        .build()
        .map_err(|e| DomainError::Internal(e.to_string()))?;
    client
        .get(url.clone())
        .send()
        .await
        .map_err(|_| DomainError::FetchFailed("Could not reach that site.".into()))
}

/// Addresses that stay blocked even for the `IMPORT_ALLOW_HOST` host: link-local, unspecified, multicast and the
/// cloud metadata endpoints. The exemption only lifts the loopback/private-range block, so a bad DNS answer for the
/// test host cannot reach instance metadata.
fn never_exempt(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            v4.is_unspecified()
                || (a == 169 && b == 254)
                || a >= 224
                || v4 == Ipv4Addr::new(100, 100, 100, 200) // Alibaba metadata
                || v4 == Ipv4Addr::new(192, 0, 0, 192) // Oracle metadata
        }
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => never_exempt(IpAddr::V4(v4)),
            None => {
                let s = v6.segments();
                v6.is_unspecified()
                    || s[0] & 0xffc0 == 0xfe80 // fe80::/10
                    || s[0] & 0xff00 == 0xff00 // ff00::/8
                    || v6 == Ipv6Addr::new(0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254) // AWS IPv6 metadata
            }
        },
    }
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
    fn exempt_host_still_never_reaches_link_local_or_metadata() {
        for ip in [
            "169.254.169.254",
            "169.254.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "100.100.100.200",
            "192.0.0.192",
            "::",
            "fe80::1",
            "febf::1",
            "ff02::1",
            "fd00:ec2::254",
            "::ffff:169.254.169.254",
            "::ffff:0.0.0.0",
        ] {
            assert!(never_exempt(ip.parse().unwrap()), "{ip} must stay blocked");
        }
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.18.0.5",
            "192.168.1.1",
            "::1",
            "fd12::1",
            "8.8.8.8",
        ] {
            assert!(!never_exempt(ip.parse().unwrap()), "{ip} may be exempted");
        }
    }

    #[tokio::test]
    async fn exempt_host_cannot_be_a_metadata_address() {
        let policy = FetchPolicy::default()
            .with_allowed_host("169.254.169.254:80")
            .unwrap();
        let url = Url::parse("http://169.254.169.254/latest/meta-data/").unwrap();
        assert!(matches!(
            fetch(&policy, &url, 1024).await,
            Err(DomainError::BlockedAddress)
        ));
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
            assert!(matches!(err, DomainError::BlockedAddress), "{u}: {err:?}");
        }
    }

    #[tokio::test]
    async fn allowed_host_opens_exactly_one_host_and_port() {
        let policy = FetchPolicy::default()
            .with_allowed_host("127.0.0.1:9")
            .unwrap();
        // The allowed host and port is attempted (nothing listens, so it fails to connect, not as blocked)...
        let err = fetch(&policy, &Url::parse("http://127.0.0.1:9/").unwrap(), 1000)
            .await
            .err()
            .unwrap();
        assert!(matches!(err, DomainError::FetchFailed(_)), "{err:?}");
        // ...and every other internal address stays blocked, including the same host on another port.
        for u in [
            "http://127.0.0.1:10/",
            "http://127.0.0.1/",
            "http://localhost:9/",
            "http://10.0.0.1:9/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]:9/",
        ] {
            let err = fetch(&policy, &Url::parse(u).unwrap(), 1000)
                .await
                .err()
                .unwrap_or_else(|| panic!("{u} was fetched"));
            assert!(matches!(err, DomainError::BlockedAddress), "{u}: {err:?}");
        }
    }

    #[test]
    fn allowed_host_parsing() {
        assert!(FetchPolicy::default().with_allowed_host("").is_ok());
        assert!(
            FetchPolicy::default()
                .with_allowed_host("fixture:4010")
                .is_ok()
        );
        for bad in [
            "fixture",
            "fixture:x",
            ":80",
            "a/b:80",
            "[::1]:80",
            "u@h:80",
        ] {
            assert!(
                FetchPolicy::default().with_allowed_host(bad).is_err(),
                "{bad}"
            );
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
