//! Recipe import: link (`safe_fetch` + `jsonld`), text and photos (`ai`).
//!
//! Import endpoints never save: they return a [`crate::models::RecipeDraft`] and the client POSTs the reviewed
//! draft to `/api/recipes`.

use url::Url;

pub mod ai;
pub mod jsonld;
pub mod photo;
pub mod readable;
pub mod safe_fetch;

/// Form of a source URL used to spot "already saved" links (LNK-5): lower-case scheme/host and default port (the
/// `url` crate does both), no fragment, no `utm_*`/`fbclid`/`gclid` params, no trailing slash.
pub fn normalize_url(url: &Url) -> String {
    let mut u = url.clone();
    u.set_fragment(None);
    let kept: Vec<(String, String)> = u
        .query_pairs()
        .filter(|(k, _)| !(k.starts_with("utm_") || k == "fbclid" || k == "gclid"))
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if kept.is_empty() {
        u.set_query(None);
    } else {
        u.query_pairs_mut().clear().extend_pairs(kept);
    }
    let path = u.path().trim_end_matches('/').to_string();
    u.set_path(&path);
    u.as_str().trim_end_matches('/').to_string() // the root path "/" cannot be empty in a Url
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(s: &str) -> String {
        normalize_url(&Url::parse(s).unwrap())
    }

    #[test]
    fn urls_are_normalised() {
        let want = "https://example.com/recipes/soup";
        for u in [
            "https://example.com/recipes/soup",
            "HTTPS://Example.COM/recipes/soup/",
            "https://example.com:443/recipes/soup#comments",
            "https://example.com/recipes/soup?utm_source=x&fbclid=1&gclid=2",
        ] {
            assert_eq!(n(u), want, "{u}");
        }
        assert_eq!(n("https://example.com/"), "https://example.com");
        assert_eq!(
            n("https://example.com/r?id=3&utm_medium=a"),
            "https://example.com/r?id=3"
        );
        assert_ne!(
            n("https://example.com/r?id=3"),
            n("https://example.com/r?id=4")
        );
    }
}
