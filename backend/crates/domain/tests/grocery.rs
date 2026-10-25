//! Grocery logic: the shared ingredient-line fixture (also read by the frontend's scale.fixture.test.ts) and the
//! merge rules behind GRO-1 to GRO-3.

use std::collections::HashMap;

use domain::Ingredient;
use domain::grocery::{
    Amount, GeneratedItem, RecipeLines, Section, build_items, classify, format_amount_quantity,
    format_quantity, merge_key, parse_line, scale_servings,
};
use domain::uuid::Uuid;

const FIXTURE: &str = include_str!("fixtures/ingredient-lines.json");

fn near(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

#[test]
fn every_fixture_line_reads_as_expected() {
    let lines: Vec<serde_json::Value> = serde_json::from_str(FIXTURE).unwrap();
    assert!(
        lines.len() >= 60,
        "the fixture should hold at least 60 lines"
    );
    let mut sections = std::collections::HashSet::new();
    let mut misses = Vec::new();
    for line in &lines {
        let text = line["text"].as_str().unwrap();
        let want_unit = line["unit"].as_str().map(str::to_string);
        let want_key = line["key"].as_str().unwrap();
        let want_section =
            Section::parse(line["section"].as_str().unwrap()).expect("a valid section name");
        sections.insert(want_section);
        let got = parse_line(text);
        let want_qty = line["quantity"]
            .as_object()
            .map(|q| (q["min"].as_f64().unwrap(), q["max"].as_f64()));
        let got_qty = got.amount.as_ref().map(|a| (a.min, a.max));
        let qty_ok = match (want_qty, got_qty) {
            (None, None) => true,
            (Some((a, b)), Some((c, d))) => {
                near(a, c) && b.zip(d).is_none_or(|(x, y)| near(x, y)) && b.is_some() == d.is_some()
            }
            _ => false,
        };
        let mut problems = Vec::new();
        if !qty_ok {
            problems.push(format!("quantity {got_qty:?}, want {want_qty:?}"));
        }
        if got.amount.as_ref().and_then(|a| a.unit.clone()) != want_unit {
            problems.push(format!(
                "unit {:?}, want {want_unit:?}",
                got.amount.as_ref().and_then(|a| a.unit.clone())
            ));
        }
        if got.key != want_key {
            problems.push(format!("key {:?}, want {want_key:?}", got.key));
        }
        if classify(want_key) != want_section {
            problems.push(format!(
                "section {}, want {want_section}",
                classify(&got.key)
            ));
        }
        if !problems.is_empty() {
            misses.push(format!("{text:?}: {}", problems.join("; ")));
        }
    }
    assert!(
        misses.is_empty(),
        "{} of {} fixture lines differ:\n{}",
        misses.len(),
        lines.len(),
        misses.join("\n")
    );
    assert_eq!(sections.len(), 6, "the fixture should cover every section");
}

fn lines(texts: &[&str]) -> Vec<Ingredient> {
    texts
        .iter()
        .map(|t| Ingredient {
            text: (*t).to_string(),
            section: None,
        })
        .collect()
}

fn build(recipes: &[(&[&str], f64)], overrides: &HashMap<String, Section>) -> Vec<GeneratedItem> {
    let owned: Vec<(Uuid, f64, Vec<Ingredient>)> = recipes
        .iter()
        .map(|(t, s)| (Uuid::new_v4(), *s, lines(t)))
        .collect();
    let refs: Vec<RecipeLines<'_>> = owned
        .iter()
        .map(|(id, scale, ing)| RecipeLines {
            recipe_id: *id,
            scale: *scale,
            ingredients: ing,
        })
        .collect();
    build_items(&refs, overrides)
}

fn amount(min: f64, max: Option<f64>, unit: Option<&str>) -> Amount {
    Amount {
        min,
        max,
        unit: unit.map(str::to_string),
    }
}

#[test]
fn counts_add_and_take_the_plural() {
    let items = build(
        &[(&["2 onions"], 1.0), (&["1 onion"], 1.0)],
        &HashMap::new(),
    );
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].name, "onions");
    assert_eq!(items[0].amounts, vec![amount(3.0, None, None)]);
    assert_eq!(items[0].recipe_ids.len(), 2);
    let single = build(&[(&["1 onion"], 1.0)], &HashMap::new());
    assert_eq!(single[0].name, "onion");
}

#[test]
fn different_units_sit_side_by_side_in_first_seen_order() {
    let items = build(
        &[
            (&["1 cup milk"], 1.0),
            (&["2 tbsp milk", "1 cup milk"], 1.0),
        ],
        &HashMap::new(),
    );
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].name, "milk");
    assert_eq!(
        items[0].amounts,
        vec![
            amount(2.0, None, Some("cup")),
            amount(2.0, None, Some("tbsp"))
        ]
    );
}

#[test]
fn scale_applies_before_formatting() {
    let items = build(&[(&["1 1/2 cups flour"], 0.5)], &HashMap::new());
    let a = &items[0].amounts[0];
    assert_eq!(format_amount_quantity(a), "¾");
    assert_eq!(a.unit.as_deref(), Some("cup"));
}

#[test]
fn ranges_add_min_to_min_and_max_to_max() {
    let items = build(
        &[(&["2-3 cloves garlic"], 1.0), (&["1 clove garlic"], 1.0)],
        &HashMap::new(),
    );
    assert_eq!(
        items[0].amounts,
        vec![amount(3.0, Some(4.0), Some("clove"))]
    );
    assert_eq!(format_amount_quantity(&items[0].amounts[0]), "3–4");
}

#[test]
fn overrides_win_over_the_dictionary() {
    let none = build(&[(&["1 cup flour"], 1.0)], &HashMap::new());
    assert_eq!(none[0].section, Section::Pantry);
    let moved = HashMap::from([("flour".to_string(), Section::Fridge)]);
    assert_eq!(
        build(&[(&["1 cup flour"], 1.0)], &moved)[0].section,
        Section::Fridge
    );
}

#[test]
fn items_come_back_in_store_order() {
    let items = build(
        &[(
            &[
                "1 cup flour",
                "1 cup frozen peas",
                "1 lb ground beef",
                "1 onion",
                "1 cup milk",
                "1 roll paper towels",
                "2 apples",
                "salt",
            ],
            1.0,
        )],
        &HashMap::new(),
    );
    let sections: Vec<Section> = items.iter().map(|i| i.section).collect();
    assert_eq!(
        sections,
        [
            Section::Produce,
            Section::Produce,
            Section::Meat,
            Section::Fridge,
            Section::Freezer,
            Section::Pantry,
            Section::Pantry,
            Section::Other
        ]
    );
    let produce: Vec<&str> = items.iter().take(2).map(|i| i.name.as_str()).collect();
    assert_eq!(produce, ["apples", "onion"]);
    assert_eq!(
        Section::ALL.map(Section::as_str),
        ["produce", "meat", "fridge", "freezer", "pantry", "other"]
    );
}

#[test]
fn unparseable_lines_are_kept_and_blank_ones_skipped() {
    let items = build(
        &[
            (
                &["salt to taste", "", "   ", "2 cups plus 2 tbsp flour"],
                2.0,
            ),
            (&["1 tsp salt"], 1.0),
        ],
        &HashMap::new(),
    );
    let names: Vec<&str> = items.iter().map(|i| i.name.as_str()).collect();
    assert_eq!(names, ["2 cups plus 2 tbsp flour", "salt", "salt to taste"]);
    let flour = &items[0];
    assert!(flour.amounts.is_empty());
    assert_eq!(items[1].amounts, vec![amount(1.0, None, Some("tsp"))]);
    assert!(items[2].amounts.is_empty());
    assert!(build(&[(&["", " "], 1.0)], &HashMap::new()).is_empty());
}

#[test]
fn a_recipe_is_listed_once_per_item() {
    let items = build(&[(&["1 onion", "2 onions"], 1.0)], &HashMap::new());
    assert_eq!(items[0].recipe_ids.len(), 1);
    assert_eq!(items[0].amounts, vec![amount(3.0, None, None)]);
}

#[test]
fn format_quantity_matches_format_number_in_scale_ts() {
    for (v, want) in [
        (1.5, "1½"),
        (0.333, "⅓"),
        (0.01, "⅛"),
        (12.4, "12"),
        (1234.0, "1,234"),
        (2.0, "2"),
        (0.75, "¾"),
        (5.3, "5¼"),
    ] {
        assert_eq!(format_quantity(v), want, "{v}");
    }
    assert_eq!(format_amount_quantity(&amount(2.0, Some(3.0), None)), "2–3");
    assert_eq!(format_amount_quantity(&amount(2.0, Some(2.0), None)), "2");
}

#[test]
fn servings_scale_like_the_recipe_page() {
    for (text, factor, want) in [
        ("4-6", 0.5, "2–3"),
        ("4", 2.0, "8"),
        ("6-8", 1.0, "6–8"),
        ("4 servings", 1.5, "6 servings"),
        ("Serves 4", 2.0, "Serves 4"),
        ("a dozen", 2.0, "a dozen"),
        ("", 2.0, ""),
    ] {
        assert_eq!(scale_servings(text, factor), want, "{text:?} x {factor}");
    }
}

#[test]
fn amount_round_trips_through_json() {
    let a = amount(1.5, Some(2.0), Some("cup"));
    assert_eq!(
        serde_json::from_str::<Amount>(&serde_json::to_string(&a).unwrap()).unwrap(),
        a
    );
    assert_eq!(
        serde_json::to_string(&Section::Freezer).unwrap(),
        "\"freezer\""
    );
}

#[test]
fn merge_key_drops_notes_sizes_and_plurals() {
    for (name, want) in [
        ("Large Onions, diced", "onion"),
        ("berries (frozen)", "berry"),
        ("basil leaves", "basil leaf"),
        ("Sweet   Potatoes", "sweet potato"),
        ("molasses", "molasses"),
        ("hummus", "hummus"),
        ("asparagus", "asparagus"),
        ("couscous", "couscous"),
        ("peas", "pea"),
    ] {
        assert_eq!(merge_key(name), want, "{name}");
    }
}
