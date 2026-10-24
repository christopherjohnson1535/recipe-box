//! Input rules from docs/API.md, applied at the trust boundary.

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

/// Postgres text cannot hold NUL bytes (they would 500); drop them from free text.
fn clean(s: &str) -> String {
    s.replace('\0', "").trim().to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rules() {
        assert_eq!(username("  Alice.B-1_ ").unwrap(), "alice.b-1_");
        assert!(username("ab").is_err());
        assert!(username(&"a".repeat(41)).is_err());
        assert!(username("bad name").is_err());
        assert!(username("émile").is_err());
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
