//! Input rules from docs/API.md, applied at the trust boundary.

use chrono::{DateTime, Days, NaiveDate, Utc};

use crate::{
    error::{DomainError, DomainResult},
    model::{Ingredient, RecipeInput},
};

pub const MAX_TITLE: usize = 300;
pub const MAX_DESCRIPTION: usize = 10_000;
pub const MAX_NOTES: usize = 20_000;
/// Per ingredient or step line.
pub const MAX_LINE: usize = 2_000;
pub const MAX_LINES: usize = 500;
pub const MAX_TAGS: usize = 50;
pub const MIN_PASSWORD: usize = 10;
/// Upper bound so argon2 is not fed megabytes.
pub const MAX_PASSWORD: usize = 1024;
/// A "made it" note ("what I'd change").
pub const MAX_COOK_NOTE: usize = 2_000;

/// Postgres text cannot hold NUL bytes (they would 500); drop them from free text.
fn clean(s: &str) -> String {
    s.replace('\0', "").trim().to_string()
}

/// Whether `name` is a file name the media store accepts: `^[0-9a-f-]{36}(\.display)?\.jpg$` (a lower-case
/// uuid-shaped stem, `.jpg`, or `.display.jpg` for the rendition). It also keeps names inside the media folder.
pub fn media_file_name(name: &str) -> bool {
    let stem = name
        .strip_suffix(".jpg")
        .map(|s| s.strip_suffix(".display").unwrap_or(s));
    stem.is_some_and(|stem| {
        stem.len() == 36
            && stem
                .bytes()
                .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f' | b'-'))
    })
}

/// Trims and lower-cases; 3–40 chars of `[a-z0-9_.-]`.
pub fn username(raw: &str) -> DomainResult<String> {
    let u = raw.trim().to_lowercase();
    let ok_chars = u
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '.' | '-'));
    if !(3..=40).contains(&u.len()) || !ok_chars {
        return Err(DomainError::validation(
            "username: 3–40 characters, letters, digits, `_`, `.` or `-`.",
        ));
    }
    Ok(u)
}

pub fn password(p: &str) -> DomainResult<()> {
    let n = p.chars().count();
    if n < MIN_PASSWORD {
        return Err(DomainError::validation(format!(
            "password: at least {MIN_PASSWORD} characters."
        )));
    }
    if n > MAX_PASSWORD {
        return Err(DomainError::validation("password: too long."));
    }
    Ok(())
}

/// A member's email for Google sign-in (ACC-6): trimmed and lower-cased; blank means none. Basic shape only (one
/// `@`, something on both sides, a dotted domain, no spaces or control characters, at most 254 characters); Google
/// is what proves the address.
pub fn email(raw: Option<&str>) -> DomainResult<Option<String>> {
    let Some(e) = raw
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
    else {
        return Ok(None);
    };
    let bad = || DomainError::validation("email: must look like name@example.com.");
    let (local, host) = e.split_once('@').ok_or_else(bad)?;
    let labels_ok = host.split('.').all(|l| !l.is_empty());
    if e.len() > 254
        || local.is_empty()
        || host.contains('@')
        || !host.contains('.')
        || !labels_ok
        || e.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(bad());
    }
    Ok(Some(e))
}

/// Where to go after Google sign-in: only a path on this site. Anything else (another address, `//host`,
/// `/\host`, a scheme, spaces, control or non-ASCII characters that a browser would strip or turn into another
/// address) becomes `/`. A path with such characters arrives percent-encoded.
pub fn next_path(raw: Option<&str>) -> String {
    let ok = |p: &&str| {
        p.len() <= 2000
            && p.starts_with('/')
            && !p.starts_with("//")
            && !p.contains('\\')
            && p.chars().all(|c| c.is_ascii_graphic())
    };
    raw.filter(ok).unwrap_or("/").to_string()
}

pub fn display_name(raw: &str) -> DomainResult<String> {
    let d = raw.trim();
    if d.is_empty() || d.chars().count() > 100 {
        return Err(DomainError::validation("displayName: 1–100 characters."));
    }
    Ok(d.to_string())
}

/// Trimmed, lower-cased, blanks dropped, deduped keeping first-seen order.
pub fn tags(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in raw {
        let t = clean(t).to_lowercase();
        if !t.is_empty() && !out.contains(&t) {
            out.push(t);
        }
    }
    out
}

/// Accepts only absolute http(s) URLs; blank means none.
pub fn source_url(raw: Option<&str>) -> DomainResult<Option<String>> {
    let Some(s) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    match url::Url::parse(s) {
        Ok(u) if matches!(u.scheme(), "http" | "https") && u.host().is_some() => {
            Ok(Some(u.to_string()))
        }
        _ => Err(DomainError::validation(
            "sourceUrl: must be an http(s) URL.",
        )),
    }
}

fn lines(field: &str, items: Vec<Ingredient>) -> DomainResult<Vec<Ingredient>> {
    if items.len() > MAX_LINES {
        return Err(DomainError::validation(format!(
            "{field}: at most {MAX_LINES} entries."
        )));
    }
    if items.iter().any(|i| i.text.chars().count() > MAX_LINE) {
        return Err(DomainError::validation(format!(
            "{field}: each entry at most {MAX_LINE} characters."
        )));
    }
    Ok(items
        .into_iter()
        .filter_map(|i| {
            let text = clean(&i.text);
            (!text.is_empty()).then(|| Ingredient {
                text,
                section: blank_to_none(i.section),
            })
        })
        .collect())
}

fn max_chars(field: &str, s: &str, max: usize) -> DomainResult<()> {
    if s.chars().count() > max {
        return Err(DomainError::validation(format!(
            "{field}: at most {max} characters."
        )));
    }
    Ok(())
}

fn blank_to_none(s: Option<String>) -> Option<String> {
    s.map(|s| clean(&s)).filter(|s| !s.is_empty())
}

fn minutes(field: &str, v: Option<i32>) -> DomainResult<Option<i32>> {
    match v {
        Some(m) if m < 0 => Err(DomainError::validation(format!(
            "{field}: must be 0 or more."
        ))),
        _ => Ok(v),
    }
}

/// Validates and normalises a POST/PUT recipe body.
pub fn recipe(input: RecipeInput) -> DomainResult<RecipeInput> {
    let title = clean(&input.title);
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(DomainError::validation(format!(
            "title: 1–{MAX_TITLE} characters."
        )));
    }
    max_chars("description", &input.description, MAX_DESCRIPTION)?;
    max_chars("notes", &input.notes, MAX_NOTES)?;
    if input.tags.len() > MAX_TAGS {
        return Err(DomainError::validation(format!(
            "tags: at most {MAX_TAGS}."
        )));
    }
    Ok(RecipeInput {
        title,
        description: clean(&input.description),
        ingredients: lines("ingredients", input.ingredients)?,
        steps: lines("steps", input.steps)?,
        servings: blank_to_none(input.servings),
        prep_minutes: minutes("prepMinutes", input.prep_minutes)?,
        cook_minutes: minutes("cookMinutes", input.cook_minutes)?,
        total_minutes: minutes("totalMinutes", input.total_minutes)?,
        notes: clean(&input.notes),
        source_url: source_url(input.source_url.as_deref())?,
        source_name: blank_to_none(input.source_name),
        source_type: input.source_type,
        image_id: input.image_id,
        photo_image_ids: input.photo_image_ids,
        tags: tags(&input.tags),
    })
}

/// A "made it" note: NUL bytes dropped, trimmed, at most [`MAX_COOK_NOTE`] characters; blank means none.
pub fn cook_note(raw: &str) -> DomainResult<String> {
    let note = clean(raw);
    if note.chars().count() > MAX_COOK_NOTE {
        return Err(DomainError::validation(format!(
            "note: at most {MAX_COOK_NOTE} characters."
        )));
    }
    Ok(note)
}

/// The day a recipe was cooked, as the cook's device sent it. The server's UTC day is only a rough guide to the
/// cook's own (UTC+14 is a day ahead), so one day past it is allowed; anything later, or before 1900, is refused.
pub fn cooked_on(day: NaiveDate, now: DateTime<Utc>) -> DomainResult<NaiveDate> {
    let latest = now.date_naive() + Days::new(1);
    if day > latest {
        return Err(DomainError::validation("cookedOn: can't be in the future."));
    }
    if day < NaiveDate::from_ymd_opt(1900, 1, 1).expect("valid date") {
        return Err(DomainError::validation("cookedOn: 1900 or later."));
    }
    Ok(day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cook_notes_are_trimmed_and_capped() {
        assert_eq!(cook_note("  less salt\0 ").unwrap(), "less salt");
        assert_eq!(cook_note("   ").unwrap(), "");
        assert!(cook_note(&"é".repeat(MAX_COOK_NOTE)).is_ok());
        let err = cook_note(&"a".repeat(MAX_COOK_NOTE + 1)).unwrap_err();
        assert!(err.to_string().starts_with("note:"), "{err}");
    }

    #[test]
    fn a_cook_day_may_be_one_day_past_the_servers() {
        let now = NaiveDate::from_ymd_opt(2026, 3, 10)
            .unwrap()
            .and_hms_opt(23, 30, 0)
            .unwrap()
            .and_utc();
        let day = |d| NaiveDate::from_ymd_opt(2026, 3, d).unwrap();
        assert_eq!(cooked_on(day(10), now).unwrap(), day(10));
        assert_eq!(cooked_on(day(11), now).unwrap(), day(11)); // already the 11th in Auckland
        assert!(cooked_on(day(12), now).is_err());
        assert!(cooked_on(NaiveDate::from_ymd_opt(1899, 12, 31).unwrap(), now).is_err());
        assert!(cooked_on(NaiveDate::from_ymd_opt(1900, 1, 1).unwrap(), now).is_ok());
    }

    #[test]
    fn media_names_follow_the_stored_pattern() {
        let id = "0b6a4b0e-3a8e-4a8f-9a5e-2f1f3c1d2e4f";
        assert!(media_file_name(&format!("{id}.jpg")));
        assert!(media_file_name(&format!("{id}.display.jpg")));
        for bad in [".", "", ".jpg", "a b", "a\0", "a.jpg", "../x.jpg"] {
            assert!(!media_file_name(bad), "{bad:?}");
        }
        assert!(!media_file_name(&format!("{}.jpg", id.to_uppercase())));
        assert!(!media_file_name(&format!("{id}.png")));
        assert!(!media_file_name(&format!("{id}.display.display.jpg")));
    }

    #[test]
    fn username_rules() {
        assert_eq!(username("  Alice.B-1_ ").unwrap(), "alice.b-1_");
        assert!(username("ab").is_err());
        assert!(username(&"a".repeat(41)).is_err());
        assert!(username("bad name").is_err());
        assert!(username("émile").is_err());
    }

    #[test]
    fn email_rules() {
        assert_eq!(email(None).unwrap(), None);
        assert_eq!(email(Some("  \t ")).unwrap(), None);
        assert_eq!(
            email(Some("  Sam.Smith+rb@Example.COM "))
                .unwrap()
                .as_deref(),
            Some("sam.smith+rb@example.com")
        );
        for bad in [
            "sam",
            "@example.com",
            "sam@",
            "sam@example",
            "sam@@example.com",
            "sam@exa@mple.com",
            "sam@.com",
            "sam@example..com",
            "sam smith@example.com",
            "sam@exam\nple.com",
        ] {
            assert!(email(Some(bad)).is_err(), "{bad:?}");
        }
        assert!(email(Some(&format!("{}@example.com", "a".repeat(250)))).is_err());
    }

    #[test]
    fn next_is_a_path_on_this_site_or_the_front_page() {
        for (raw, want) in [
            (Some("/recipes/1?x=1#y"), "/recipes/1?x=1#y"),
            (Some("/"), "/"),
            (None, "/"),
            (Some(""), "/"),
            (Some("recipes"), "/"),
            (Some("https://evil.example"), "/"),
            (Some("//evil.example"), "/"),
            (Some("/\\evil.example"), "/"),
            (Some("/a\\b"), "/"),
            (Some("javascript:alert(1)"), "/"),
            (Some("/\t/evil.example"), "/"),
            (Some("/ foo"), "/"),
            (Some("/a\nb"), "/"),
            (Some("/caf\u{e9}"), "/"),
            (Some("/caf%C3%A9"), "/caf%C3%A9"),
        ] {
            assert_eq!(next_path(raw), want, "{raw:?}");
        }
        assert_eq!(next_path(Some(&format!("/{}", "a".repeat(2000)))), "/");
    }

    #[test]
    fn password_rules() {
        assert!(password("123456789").is_err());
        assert!(password("1234567890").is_ok());
        assert!(password(&"x".repeat(MAX_PASSWORD + 1)).is_err());
    }

    #[test]
    fn recipe_field_caps() {
        let base = || RecipeInput {
            title: "x".into(),
            ..Default::default()
        };
        let line = |n: usize| Ingredient {
            text: "x".repeat(n),
            section: None,
        };
        let err = |r: DomainResult<RecipeInput>| r.unwrap_err().to_string();
        let mut r = base();
        r.description = "x".repeat(MAX_DESCRIPTION + 1);
        assert!(err(recipe(r)).starts_with("description:"));
        let mut r = base();
        r.description = "x".repeat(MAX_DESCRIPTION);
        r.notes = "x".repeat(MAX_NOTES);
        assert!(recipe(r).is_ok());
        let mut r = base();
        r.notes = "x".repeat(MAX_NOTES + 1);
        assert!(err(recipe(r)).starts_with("notes:"));
        let mut r = base();
        r.ingredients = vec![line(MAX_LINE + 1)];
        assert!(err(recipe(r)).starts_with("ingredients:"));
        let mut r = base();
        r.steps = (0..=MAX_LINES).map(|_| line(1)).collect();
        assert!(err(recipe(r)).starts_with("steps:"));
        let mut r = base();
        r.steps = (0..MAX_LINES).map(|_| line(MAX_LINE)).collect();
        assert!(recipe(r).is_ok());
        let mut r = base();
        r.tags = (0..=MAX_TAGS).map(|i| format!("t{i}")).collect();
        assert!(err(recipe(r)).starts_with("tags:"));
    }

    #[test]
    fn tags_are_normalised() {
        let raw = vec![
            " Dinner ".into(),
            "dinner".into(),
            "".into(),
            "Quick".into(),
        ];
        assert_eq!(tags(&raw), vec!["dinner", "quick"]);
    }

    #[test]
    fn source_url_rules() {
        assert_eq!(source_url(Some("  ")).unwrap(), None);
        assert_eq!(
            source_url(Some("https://example.com/a"))
                .unwrap()
                .as_deref(),
            Some("https://example.com/a")
        );
        assert!(source_url(Some("javascript:alert(1)")).is_err());
        assert!(source_url(Some("ftp://example.com")).is_err());
        assert!(source_url(Some("not a url")).is_err());
    }

    #[test]
    fn recipe_rules() {
        let ok = recipe(RecipeInput {
            title: "  Soup ".into(),
            ingredients: vec![
                Ingredient {
                    text: " 1 onion ".into(),
                    section: Some(" ".into()),
                },
                Ingredient {
                    text: "   ".into(),
                    section: None,
                },
            ],
            ..Default::default()
        })
        .unwrap();
        assert_eq!(ok.title, "Soup");
        assert_eq!(
            ok.ingredients,
            vec![Ingredient {
                text: "1 onion".into(),
                section: None
            }]
        );

        assert!(recipe(RecipeInput::default()).is_err());
        assert!(
            recipe(RecipeInput {
                title: "x".repeat(301),
                ..Default::default()
            })
            .is_err()
        );
        assert!(
            recipe(RecipeInput {
                title: "x".repeat(300),
                ..Default::default()
            })
            .is_ok()
        );
        assert!(
            recipe(RecipeInput {
                title: "x".into(),
                cook_minutes: Some(-1),
                ..Default::default()
            })
            .is_err()
        );
    }
}
