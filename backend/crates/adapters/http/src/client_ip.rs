//! Who is calling, for rate limiting only (issue #33).
//!
//! The address is the TCP peer. `X-Forwarded-For` is read only when the peer is one of the configured trusted
//! proxies (`TRUSTED_PROXIES`, default none); otherwise the header is ignored, because any client can send it.
//! Behind a trusted proxy the header is read from the right, skipping trusted proxies: the first address that is
//! not one is the client. Entries to the left of it are whatever the client claimed and are never used.
//!
//! When the request came through a trusted proxy but no real client can be told (no header, a garbled one, or
//! only trusted hops), there is no address: `None`. The proxy's own address would be shared by everybody behind
//! it, and a per-address lock on it would let one person lock everyone out. Only the username is throttled then.

use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
};

use axum::{
    extract::{ConnectInfo, FromRequestParts},
    http::{header::HeaderName, request::Parts},
};

const FORWARDED_FOR: HeaderName = HeaderName::from_static("x-forwarded-for");

/// Addresses and networks whose `X-Forwarded-For` is believed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrustedProxies(Arc<[(IpAddr, u8)]>);

impl TrustedProxies {
    /// Parses a comma-separated list of addresses or CIDR networks: `172.16.0.0/12, 10.1.2.3, ::1`.
    /// Blank means none. The error names the bad entry.
    pub fn parse(list: &str) -> Result<Self, String> {
        let mut nets = Vec::new();
        for item in list.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let (addr, bits) = match item.split_once('/') {
                Some((a, b)) => (a, Some(b)),
                None => (item, None),
            };
            let ip: IpAddr = addr
                .parse()
                .map_err(|_| format!("`{item}` is not an IP address or network"))?;
            let ip = ip.to_canonical();
            let max = if ip.is_ipv4() { 32 } else { 128 };
            let bits = match bits {
                None => max,
                Some(b) => b
                    .parse::<u8>()
                    .ok()
                    .filter(|b| *b <= max)
                    .ok_or_else(|| format!("`{item}` has an invalid prefix length"))?,
            };
            nets.push((ip, bits));
        }
        Ok(Self(nets.into()))
    }

    fn contains(&self, ip: IpAddr) -> bool {
        let ip = ip.to_canonical();
        self.0
            .iter()
            .any(|(net, bits)| same_prefix(*net, ip, *bits))
    }

    /// The client address for a request from `peer` carrying these `X-Forwarded-For` header values. `None` when
    /// the real client cannot be told: no peer, or a trusted proxy that did not say who it is serving.
    pub fn client<'a>(
        &self,
        peer: Option<IpAddr>,
        forwarded_for: impl DoubleEndedIterator<Item = &'a str>,
    ) -> Option<IpAddr> {
        let peer = peer?.to_canonical();
        if !self.contains(peer) {
            return Some(peer);
        }
        // Rightmost first, across all header lines. An entry that is not an address ends the walk: from there
        // on nothing can be told, so there is no client address (the proxy's would be everybody's).
        for entry in forwarded_for
            .rev()
            .flat_map(|v| v.rsplit(','))
            .map(str::trim)
        {
            let Ok(ip) = entry.parse::<IpAddr>() else {
                return None;
            };
            if !self.contains(ip) {
                return Some(ip.to_canonical());
            }
        }
        None
    }
}

fn same_prefix(a: IpAddr, b: IpAddr, bits: u8) -> bool {
    match (a, b) {
        (IpAddr::V4(a), IpAddr::V4(b)) => {
            let mask = u32::MAX.checked_shl(32 - u32::from(bits)).unwrap_or(0);
            u32::from(a) & mask == u32::from(b) & mask
        }
        (IpAddr::V6(a), IpAddr::V6(b)) => {
            let mask = u128::MAX.checked_shl(128 - u32::from(bits)).unwrap_or(0);
            u128::from(a) & mask == u128::from(b) & mask
        }
        _ => false,
    }
}

/// The caller's address, if it can be told (no `ConnectInfo`, e.g. in a router test, gives `None`, and then only
/// the username is throttled). Never rejects.
#[derive(Debug, Clone, Copy)]
pub struct ClientIp(pub Option<IpAddr>);

impl<S> FromRequestParts<S> for ClientIp
where
    crate::HttpState: axum::extract::FromRef<S>,
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let http = crate::HttpState::from_ref(state);
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip());
        let values = parts
            .headers
            .get_all(FORWARDED_FOR)
            .iter()
            .filter_map(|v| v.to_str().ok());
        Ok(Self(http.trusted_proxies.client(peer, values)))
    }
}

use axum::extract::FromRef;

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn client(trusted: &str, peer: &str, xff: &[&str]) -> Option<IpAddr> {
        TrustedProxies::parse(trusted)
            .unwrap()
            .client(Some(ip(peer)), xff.iter().copied())
    }

    #[test]
    fn the_header_is_ignored_unless_the_peer_is_trusted() {
        // Nothing configured: a spoofed header changes nothing.
        assert_eq!(
            client("", "203.0.113.9", &["1.2.3.4"]),
            Some(ip("203.0.113.9"))
        );
        // Configured, but the peer is somebody else.
        assert_eq!(
            client("172.18.0.0/16", "203.0.113.9", &["1.2.3.4"]),
            Some(ip("203.0.113.9"))
        );
    }

    #[test]
    fn a_trusted_peer_gets_the_rightmost_untrusted_address() {
        assert_eq!(
            client("172.18.0.0/16", "172.18.0.5", &["198.51.100.4"]),
            Some(ip("198.51.100.4"))
        );
        // Left entries are the client's claims; the proxy appended the right one.
        assert_eq!(
            client("172.18.0.0/16", "172.18.0.5", &["6.6.6.6, 198.51.100.4"]),
            Some(ip("198.51.100.4"))
        );
        // Several header lines and a second trusted hop are skipped.
        assert_eq!(
            client(
                "172.18.0.0/16,10.0.0.1",
                "172.18.0.5",
                &["6.6.6.6", "198.51.100.4, 10.0.0.1"]
            ),
            Some(ip("198.51.100.4"))
        );
    }

    #[test]
    fn a_trusted_peer_with_no_usable_header_has_no_client_address() {
        assert_eq!(client("172.18.0.0/16", "172.18.0.5", &[]), None);
        assert_eq!(client("172.18.0.0/16", "172.18.0.5", &["unknown"]), None);
        assert_eq!(
            client("172.18.0.0/16", "172.18.0.5", &["6.6.6.6, not-an-ip"]),
            None
        );
        assert_eq!(client("172.18.0.0/16", "172.18.0.5", &["172.18.0.9"]), None);
    }

    #[test]
    fn no_peer_means_no_address() {
        let t = TrustedProxies::parse("10.0.0.0/8").unwrap();
        assert_eq!(t.client(None, ["1.2.3.4"].into_iter()), None);
    }

    #[test]
    fn parses_hosts_networks_and_v6_and_rejects_junk() {
        assert!(TrustedProxies::parse("").unwrap().0.is_empty());
        assert_eq!(
            client("::1, fd00::/8", "fd12::1", &["2001:db8::7"]),
            Some(ip("2001:db8::7"))
        );
        assert_eq!(
            client("::ffff:10.0.0.1", "10.0.0.1", &["1.2.3.4"]),
            Some(ip("1.2.3.4"))
        );
        for bad in ["nope", "10.0.0.0/33", "10.0.0.0/x", "::1/129"] {
            assert!(TrustedProxies::parse(bad).is_err(), "{bad}");
        }
        // Trusting everything leaves no client to find.
        assert_eq!(client("0.0.0.0/0", "9.9.9.9", &["1.1.1.1"]), None);
    }
}
