//! Input rules from docs/API.md, applied at the trust boundary.

use crate::{
    error::{AppError, AppResult},
    models::{Ingredient, RecipeInput},
};

pub const MAX_TITLE: usize = 300;
pub const MIN_PASSWORD: usize = 10;
/// Upper bound so argon2 is not fed megabytes.
pub const MAX_PASSWORD: usize = 1024;

/// Postgres text cannot hold NUL bytes (they would 500); drop them from free text.
fn clean(s: &str) -> String {
    s.replace('\0', "").trim().to_string()
}

/// Trims and lower-cases; 3–40 chars of `[a-z0-9_.-]`.
pub fn username(raw: &str) -> AppResult<String> {
    let u = raw.trim().to_lowercase();
    let ok_chars = u
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '.' | '-'));
    if !(3..=40).contains(&u.len()) || !ok_chars {
        return Err(AppError::validation(
            "username: 3–40 characters, letters, digits, `_`, `.` or `-`.",
        ));
    }
    Ok(u)
}

pub fn password(p: &str) -> AppResult<()> {
    let n = p.chars().count();
    if n < MIN_PASSWORD {
        return Err(AppError::validation(format!(
            "password: at least {MIN_PASSWORD} characters."
        )));
    }
    if n > MAX_PASSWORD {
        return Err(AppError::validation("password: too long."));
    }
    Ok(())
}

pub fn display_name(raw: &str) -> AppResult<String> {
    let d = raw.trim();
    if d.is_empty() || d.chars().count() > 100 {
        return Err(AppError::validation("displayName: 1–100 characters."));
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
pub fn source_url(raw: Option<&str>) -> AppResult<Option<String>> {
    let Some(s) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    match url::Url::parse(s) {
        Ok(u) if matches!(u.scheme(), "http" | "https") && u.host().is_some() => {
            Ok(Some(u.to_string()))
        }
        _ => Err(AppError::validation("sourceUrl: must be an http(s) URL.")),
    }
}

fn lines(items: Vec<Ingredient>) -> Vec<Ingredient> {
    items
        .into_iter()
        .filter_map(|i| {
            let text = clean(&i.text);
            (!text.is_empty()).then(|| Ingredient {
                text,
                section: blank_to_none(i.section),
            })
        })
        .collect()
}

fn blank_to_none(s: Option<String>) -> Option<String> {
    s.map(|s| clean(&s)).filter(|s| !s.is_empty())
}

fn minutes(field: &str, v: Option<i32>) -> AppResult<Option<i32>> {
    match v {
        Some(m) if m < 0 => Err(AppError::validation(format!("{field}: must be 0 or more."))),
        _ => Ok(v),
    }
}

/// Validates and normalises a POST/PUT recipe body.
pub fn recipe(input: RecipeInput) -> AppResult<RecipeInput> {
    let title = clean(&input.title);
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(AppError::validation(format!(
            "title: 1–{MAX_TITLE} characters."
        )));
    }
    Ok(RecipeInput {
        title,
        description: clean(&input.description),
        ingredients: lines(input.ingredients),
        steps: lines(input.steps),
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
