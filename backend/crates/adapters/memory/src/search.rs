//! Search matching for the in-memory store: whole-word matching on lower-cased alphanumeric tokens.
//!
//! shortcut: relevance is the number of times the query's words occur, not Postgres's `ts_rank`; there is no
//! stemming, so `tomatoes` does not find `tomato`. Upgrade when a second real storage needs the same ranking.

use domain::RecipeInput;

/// Lower-cased runs of letters and digits.
fn tokens(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// The words searched: title, description, notes and ingredient lines, as one token stream (a phrase may span them).
pub fn doc_tokens(r: &RecipeInput) -> Vec<String> {
    let ingredients: Vec<&str> = r.ingredients.iter().map(|i| i.text.as_str()).collect();
    tokens(&format!(
        "{} {} {} {}",
        r.title,
        r.description,
        r.notes,
        ingredients.join(" ")
    ))
}

/// One word, or a phrase of words that must follow each other.
struct Item {
    words: Vec<String>,
    negated: bool,
}

impl Item {
    fn occurrences(&self, doc: &[String]) -> usize {
        doc.windows(self.words.len())
            .filter(|w| *w == self.words.as_slice())
            .count()
    }
}

/// `a b or c -d "e f"` becomes groups ANDed inside and ORed between: `[[a, b], [c, !d, "e f"]]`.
fn parse(q: &str) -> Vec<Vec<Item>> {
    let mut groups: Vec<Vec<Item>> = vec![Vec::new()];
    let mut rest = q;
    loop {
        rest = rest.trim_start();
        if rest.is_empty() {
            break;
        }
        let negated = rest.starts_with('-');
        let body = rest.strip_prefix('-').unwrap_or(rest);
        let quoted = body.starts_with('"');
        let (text, after) = if let Some(inner) = body.strip_prefix('"') {
            let end = inner.find('"').unwrap_or(inner.len());
            (&inner[..end], inner.get(end + 1..).unwrap_or(""))
        } else {
            let end = body
                .find(|c: char| c.is_whitespace() || c == '"')
                .unwrap_or(body.len());
            body.split_at(end)
        };
        rest = after;
        if !quoted && !negated && text.eq_ignore_ascii_case("or") {
            groups.push(Vec::new());
            continue;
        }
        let words = tokens(text);
        if !words.is_empty() {
            groups
                .last_mut()
                .expect("groups starts non-empty")
                .push(Item { words, negated });
        }
    }
    groups.retain(|g| !g.is_empty());
    groups
}

/// For a plain query (no quotes, `-` or `or`): every word whole, the last one as a prefix.
fn prefix_terms(q: &str) -> Option<Vec<String>> {
    let words: Vec<&str> = q.split_whitespace().collect();
    if q.contains('"')
        || words
            .iter()
            .any(|w| w.starts_with('-') || w.eq_ignore_ascii_case("or"))
    {
        return None;
    }
    let terms: Vec<String> = words
        .iter()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .collect();
    (!terms.is_empty()).then_some(terms)
}

/// How well a matching recipe matches.
#[derive(Default)]
pub struct Rank {
    pub title_hit: bool,
    pub score: usize,
}

pub struct Matcher {
    lower: String,
    groups: Vec<Vec<Item>>,
    prefix: Option<Vec<String>>,
}

impl Matcher {
    pub fn new(text: &str) -> Self {
        Self {
            lower: text.to_lowercase(),
            groups: parse(text),
            prefix: prefix_terms(text),
        }
    }

    /// `None` when the recipe does not match.
    pub fn rank(&self, title: &str, tags: &[String], doc: &[String]) -> Option<Rank> {
        let title_hit = title.to_lowercase().starts_with(&self.lower);
        let tag_hit = tags
            .iter()
            .any(|t| t.to_lowercase().starts_with(&self.lower));
        let web = self
            .groups
            .iter()
            .any(|g| g.iter().all(|i| (i.occurrences(doc) > 0) != i.negated));
        let prefix = self.prefix.as_ref().is_some_and(|terms| {
            terms.iter().enumerate().all(|(n, t)| {
                if n + 1 == terms.len() {
                    doc.iter().any(|d| d.starts_with(t.as_str()))
                } else {
                    doc.contains(t)
                }
            })
        });
        (title_hit || tag_hit || web || prefix).then(|| Rank {
            title_hit,
            score: self
                .groups
                .iter()
                .flatten()
                .filter(|i| !i.negated)
                .map(|i| i.occurrences(doc))
                .sum(),
        })
    }
}
