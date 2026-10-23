//! Visible text of a web page, for the AI fallback of link import (LNK-4) when a page has no recipe data.
//!
//! Keeps `<main>` (else `<article>`, else `<body>`), drops page chrome and scripts, and puts every block on its own
//! line so headings such as "For the sauce" stay recognisable. CPU-bound: call from `spawn_blocking`, and only
//! for pages that passed `jsonld::too_complex`.

use scraper::{ElementRef, Html, Node, Selector};
use url::Url;

/// Most characters of page text sent to the AI.
pub const MAX_READABLE_CHARS: usize = 20_000;

/// Subtrees that are never recipe content.
const SKIP: &[&str] = &[
    "script", "style", "noscript", "template", "nav", "header", "footer", "aside", "form",
    "iframe", "svg", "button", "head",
];
/// Elements that start and end a line.
const BLOCK: &[&str] = &[
    "p",
    "div",
    "li",
    "ul",
    "ol",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "br",
    "tr",
    "section",
    "article",
    "main",
    "table",
    "dl",
    "dt",
    "dd",
    "blockquote",
    "pre",
    "figure",
    "figcaption",
];

pub struct Readable {
    pub text: String,
    /// `og:image`, absolute http(s) only.
    pub image_url: Option<String>,
}

pub fn readable(html: &str, page_url: &Url) -> Readable {
    let doc = Html::parse_document(html);
    let pick = |css: &str| {
        Selector::parse(css)
            .ok()
            .and_then(|s| doc.select(&s).next())
    };
    let meta = |prop: &str| {
        pick(&format!("meta[property=\"{prop}\"]"))
            .and_then(|e| e.value().attr("content"))
            .map(|c| c.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|c| !c.is_empty())
    };

    let root = pick("main")
        .or_else(|| pick("article"))
        .or_else(|| pick("body"));
    let mut raw = String::new();
    if let Some(root) = root {
        walk(root, &mut raw);
    }
    let mut text = raw
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    let title = meta("og:title").or_else(|| {
        pick("title")
            .map(|t| {
                t.text()
                    .collect::<String>()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|t| !t.is_empty())
    });
    if let Some(title) = title.filter(|t| !text.starts_with(t.as_str())) {
        text = format!("{title}\n{text}");
    }
    if let Some((i, _)) = text.char_indices().nth(MAX_READABLE_CHARS) {
        text.truncate(i);
    }

    let image_url = meta("og:image")
        .and_then(|u| page_url.join(&u).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(String::from);
    Readable { text, image_url }
}

fn walk(el: ElementRef, out: &mut String) {
    let name = el.value().name();
    if SKIP.contains(&name) {
        return;
    }
    let block = BLOCK.contains(&name);
    if block {
        out.push('\n');
    }
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.extend(t.chars().map(|c| if c.is_whitespace() { ' ' } else { c })),
            Node::Element(_) => walk(ElementRef::wrap(child).unwrap(), out),
            _ => {}
        }
    }
    if block {
        out.push('\n');
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(html: &str) -> Readable {
        readable(html, &Url::parse("https://example.com/a/b").unwrap())
    }

    #[test]
    fn chrome_and_scripts_are_dropped_and_headings_keep_their_lines() {
        let r = read(
            "<html><head><title>Soup</title><style>.x{}</style></head><body>\
             <nav>Home About</nav><script>var secret=1;</script>\
             <h1>Soup</h1><p>A   warm\n soup.</p><h2>For the broth</h2><ul><li>1 onion</li><li>2 <b>carrots</b></li></ul>\
             <button>Print</button><footer>Copyright</footer></body></html>",
        );
        assert_eq!(
            r.text,
            "Soup\nA warm soup.\nFor the broth\n1 onion\n2 carrots"
        );
    }

    #[test]
    fn title_is_prefixed_when_missing_from_the_start() {
        let r = read("<title>Nice Soup</title><body><p>Boil water.</p></body>");
        assert_eq!(r.text, "Nice Soup\nBoil water.");
    }

    #[test]
    fn main_is_preferred_over_the_rest_of_the_body() {
        let r = read("<body><div>Sidebar ad</div><main><p>The recipe</p></main></body>");
        assert_eq!(r.text, "The recipe");
        let r = read("<body><div>Sidebar ad</div><article><p>The article</p></article></body>");
        assert_eq!(r.text, "The article");
    }

    #[test]
    fn text_is_capped() {
        let r = read(&format!(
            "<body><p>{}</p></body>",
            "a".repeat(MAX_READABLE_CHARS * 2)
        ));
        assert_eq!(r.text.chars().count(), MAX_READABLE_CHARS);
    }

    #[test]
    fn og_image_is_resolved_and_limited_to_http() {
        let r =
            read("<head><meta property=\"og:image\" content=\"/img/p.jpg\"></head><body>x</body>");
        assert_eq!(
            r.image_url.as_deref(),
            Some("https://example.com/img/p.jpg")
        );
        let r = read(
            "<head><meta property=\"og:image\" content=\"data:image/png;base64,AAAA\"></head><body>x</body>",
        );
        assert_eq!(r.image_url, None);
    }
}
