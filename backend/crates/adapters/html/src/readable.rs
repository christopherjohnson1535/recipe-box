//! Visible text of a web page, for the AI fallback of link import (LNK-3) when a page has no recipe data.
//!
//! Keeps `<main>` (else `<article>`, else `<body>`), drops page chrome and scripts, and puts every block on its own
//! line so headings such as "For the sauce" stay recognisable. CPU-bound: call from `spawn_blocking`. Pages that
//! fail `jsonld::too_complex` are not parsed and read as empty.

use scraper::{ElementRef, Html, Node, Selector};

use domain::MIN_PAGE_CHARS;

use super::jsonld;
use url::Url;

/// Most characters of page text sent to the AI.
pub const MAX_READABLE_CHARS: usize = 20_000;
/// Deepest element the text walk descends into (`too_complex` refuses deeper pages first; this keeps the stack safe anyway).
const MAX_WALK_DEPTH: usize = 400;

/// Subtrees that are never recipe content.
const SKIP: &[&str] = &[
    "script", "style", "noscript", "template", "nav", "header", "footer", "aside", "iframe", "svg",
    "button", "head",
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
    "td",
    "th",
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
    if jsonld::too_complex(html) {
        return Readable {
            text: String::new(),
            image_url: None,
        };
    }
    let doc = Html::parse_document(html);
    let pick = |css: &str| {
        Selector::parse(css)
            .ok()
            .and_then(|s| doc.select(&s).next())
    };
    // First root with enough text: a teaser `<article>` or a near-empty `<main>` must not hide the recipe.
    let mut text = String::new();
    for css in ["main", "article", "body"] {
        let Some(root) = pick(css) else { continue };
        let mut raw = String::new();
        walk(root, &mut raw, false, 0);
        text = raw
            .lines()
            .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|l| !l.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if text.chars().filter(|c| !c.is_whitespace()).count() >= MIN_PAGE_CHARS {
            break;
        }
    }

    let title = jsonld::meta(html, "og:title").or_else(|| jsonld::title_tag(html));
    if let Some(title) = title.filter(|t| !text.starts_with(t.as_str())) {
        text = format!("{title}\n{text}");
    }
    if let Some((i, _)) = text.char_indices().nth(MAX_READABLE_CHARS) {
        text.truncate(i);
    }

    let image_url = jsonld::meta(html, "og:image")
        .and_then(|u| page_url.join(&u).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(String::from);
    Readable { text, image_url }
}

fn walk(el: ElementRef, out: &mut String, pre: bool, depth: usize) {
    let name = el.value().name();
    if SKIP.contains(&name) || depth > MAX_WALK_DEPTH {
        return;
    }
    let block = BLOCK.contains(&name);
    let pre = pre || name == "pre";
    if block {
        out.push('\n');
    }
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.extend(t.chars().map(|c| {
                if c.is_whitespace() && !(pre && c == '\n') {
                    ' '
                } else {
                    c
                }
            })),
            Node::Element(_) => walk(ElementRef::wrap(child).unwrap(), out, pre, depth + 1),
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

    fn filler() -> String {
        "Simmer gently until thick. ".repeat(10)
    }

    #[test]
    fn main_is_preferred_over_the_rest_of_the_body() {
        let f = filler();
        let r = read(&format!(
            "<body><div>Sidebar ad</div><main><p>The recipe {f}</p></main></body>"
        ));
        assert!(r.text.starts_with("The recipe") && !r.text.contains("Sidebar"));
        let r = read(&format!(
            "<body><div>Sidebar ad</div><article><p>The article {f}</p></article></body>"
        ));
        assert!(r.text.starts_with("The article") && !r.text.contains("Sidebar"));
    }

    #[test]
    fn a_thin_main_or_article_falls_back_to_the_body() {
        let f = filler();
        let r = read(&format!(
            "<body><article><p>Teaser</p></article><div class=\"entry-content\">The real recipe {f}</div></body>"
        ));
        assert!(r.text.contains("The real recipe"), "{}", r.text);
    }

    #[test]
    fn a_page_wrapped_in_a_form_is_still_read() {
        let r = read(&format!(
            "<body><form id=\"aspnetForm\"><div>Lentil stew {}</div><input type=\"text\"><button>Go</button></form></body>",
            filler()
        ));
        assert!(r.text.starts_with("Lentil stew"), "{}", r.text);
        assert!(!r.text.contains("Go"));
    }

    #[test]
    fn table_cells_and_pre_lines_stay_apart() {
        let r = read(
            "<body><table><tr><td>1 cup</td><td>flour</td></tr><tr><th>2</th><th>eggs</th></tr></table>\
             <pre>Mix.\nBake.</pre></body>",
        );
        assert_eq!(r.text, "1 cup\nflour\n2\neggs\nMix.\nBake.");
    }

    #[test]
    fn a_pathological_page_reads_as_empty_without_building_a_dom() {
        let r = read(&format!(
            "<head><meta property=\"og:image\" content=\"/p.jpg\"></head><body>{}hello</body>",
            "<div></x>".repeat(30_000)
        ));
        assert_eq!((r.text.as_str(), r.image_url), ("", None));
    }

    #[test]
    fn the_walk_stops_at_its_depth_cap_and_keeps_shallow_text() {
        // `too_complex` refuses pages this deep first, so exercise `walk` on the parsed tree directly.
        let n = MAX_WALK_DEPTH + 100;
        let html = format!(
            "<body><p>shallow</p>{}deep{}</body>",
            "<div>".repeat(n),
            "</div>".repeat(n)
        );
        let doc = Html::parse_document(&html);
        let body = doc
            .select(&Selector::parse("body").unwrap())
            .next()
            .unwrap();
        let mut out = String::new();
        walk(body, &mut out, false, 0);
        assert!(out.contains("shallow") && !out.contains("deep"));
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
