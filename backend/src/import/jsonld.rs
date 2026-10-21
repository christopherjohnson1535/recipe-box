//! Recipe extraction from HTML (LNK-1/2): schema.org `Recipe` as JSON-LD (arrays, `@graph`, `@id` references,
//! HowToSection/HowToStep, ISO 8601 durations), falling back to microdata (`itemtype=".../Recipe"`).
//! Text fields have entities decoded and tags stripped. `None` means no recipe: the route answers 422.

use scraper::{ElementRef, Html, Node, Selector};
use serde_json::Value;
use url::Url;

use crate::{
    models::{Ingredient, RecipeDraft, SourceType},
    validate,
};

const MAX_TAGS: usize = 15;
const MAX_TAG_CHARS: usize = 40;

/// Extracts a draft from `html`; `page_url` resolves relative image URLs and becomes `source_url`.
/// `image_url` holds the absolute remote photo URL; the route downloads it and swaps in the stored one.
pub fn extract(html: &str, page_url: &Url) -> Option<RecipeDraft> {
    let doc = Html::parse_document(html);
    let has_content = |d: &RecipeDraft| !d.ingredients.is_empty() || !d.steps.is_empty();
    let mut draft = from_json_ld(&doc)
        .filter(has_content)
        .or_else(|| from_microdata(&doc).filter(has_content))?;

    draft.image_url = draft
        .image_url
        .and_then(|u| page_url.join(&u).ok())
        .map(String::from);
    if draft.title.is_empty() {
        draft.title = meta(&doc, "og:title")
            .or_else(|| text_of(&doc, "title"))
            .unwrap_or_default();
    }
    if draft.source_name.is_none() {
        draft.source_name = meta(&doc, "og:site_name").or_else(|| {
            page_url
                .host_str()
                .map(|h| h.trim_start_matches("www.").to_string())
        });
    }
    draft.source_url = Some(page_url.to_string());
    draft.source_type = SourceType::Link;
    Some(draft)
}

// ---------- text helpers ----------

/// Entities decoded, tags dropped; `<br>`, `<p>`, `<li>` and `<div>` become line breaks.
fn plain(s: &str) -> String {
    if !s.contains(['<', '&']) {
        return s.to_string();
    }
    let frag = Html::parse_fragment(s);
    let mut out = String::new();
    for n in frag.tree.root().descendants() {
        match n.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(e) if matches!(e.name(), "br" | "p" | "li" | "div") => out.push('\n'),
            _ => {}
        }
    }
    out
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean(s: &str) -> String {
    collapse(&plain(s))
}

fn lines(s: &str) -> Vec<String> {
    plain(s)
        .lines()
        .map(collapse)
        .filter(|l| !l.is_empty())
        .collect()
}

fn meta(doc: &Html, property: &str) -> Option<String> {
    let sel = Selector::parse(&format!(r#"meta[property="{property}"]"#)).ok()?;
    let content = doc.select(&sel).next()?.value().attr("content")?;
    Some(clean(content)).filter(|s| !s.is_empty())
}

fn text_of(doc: &Html, selector: &str) -> Option<String> {
    let el = doc.select(&Selector::parse(selector).ok()?).next()?;
    Some(clean(&el.text().collect::<String>())).filter(|s| !s.is_empty())
}

/// Splits keyword-like values on commas, then trims/lower-cases/dedupes and drops essay-length "tags".
fn tags(raw: Vec<String>) -> Vec<String> {
    let parts: Vec<String> = raw
        .iter()
        .flat_map(|s| s.split(','))
        .map(str::to_string)
        .collect();
    validate::tags(&parts)
        .into_iter()
        .filter(|t| t.chars().count() <= MAX_TAG_CHARS)
        .take(MAX_TAGS)
        .collect()
}

/// ISO 8601 duration (`PT1H30M`, `P0DT45M`, `P1DT2H`) → whole minutes. Years/months are ambiguous: `None`.
fn parse_minutes(s: &str) -> Option<i32> {
    let s = s.trim().to_ascii_uppercase();
    let rest = s.strip_prefix('P')?;
    let (date, time) = rest.split_once('T').unwrap_or((rest, ""));
    let total = sum_units(date, &[('W', 10080.0), ('D', 1440.0)])?
        + sum_units(time, &[('H', 60.0), ('M', 1.0), ('S', 1.0 / 60.0)])?;
    let m = total.round() as i32;
    (m > 0).then_some(m)
}

fn sum_units(part: &str, units: &[(char, f64)]) -> Option<f64> {
    let (mut total, mut num) = (0.0, String::new());
    for c in part.chars() {
        if c.is_ascii_digit() || c == '.' || c == ',' {
            num.push(if c == ',' { '.' } else { c });
        } else {
            let factor = units.iter().find(|(u, _)| *u == c)?.1;
            total += num.parse::<f64>().ok()? * factor;
            num.clear();
        }
    }
    num.is_empty().then_some(total)
}

fn pick_servings(items: Vec<String>) -> Option<String> {
    // WPRM sends ["6", "6 servings"]: prefer the one with words.
    items
        .iter()
        .find(|s| s.chars().any(char::is_alphabetic))
        .or(items.first())
        .cloned()
}

// ---------- JSON-LD ----------

fn from_json_ld(doc: &Html) -> Option<RecipeDraft> {
    let sel = Selector::parse(r#"script[type*="ld+json"]"#).ok()?;
    let blocks: Vec<Value> = doc
        .select(&sel)
        .filter_map(|s| {
            let text: String = s.text().collect();
            // Raw newlines inside strings are invalid JSON but common; whitespace outside strings is harmless.
            serde_json::from_str(&text)
                .or_else(|_| serde_json::from_str(&text.replace(['\n', '\r', '\t'], " ")))
                .ok()
        })
        .collect();
    let mut nodes = Vec::new();
    for b in &blocks {
        collect_nodes(b, &mut nodes);
    }
    let r = *nodes.iter().find(|n| is_recipe(n))?;

    let mut steps = Vec::new();
    if let Some(v) = r.get("recipeInstructions") {
        collect_steps(v, None, &mut steps);
    }
    let mut ingredients = Vec::new();
    for key in ["recipeIngredient", "ingredients"] {
        let mut items = Vec::new();
        if let Some(v) = r.get(key) {
            strings(v, &mut items);
        }
        ingredients.extend(items.into_iter().map(|text| Ingredient {
            text,
            section: None,
        }));
    }
    let mut tag_src = Vec::new();
    for key in ["keywords", "recipeCategory", "recipeCuisine"] {
        if let Some(v) = r.get(key) {
            strings(v, &mut tag_src);
        }
    }
    let mut yield_items = Vec::new();
    if let Some(v) = r.get("recipeYield") {
        strings(v, &mut yield_items);
    }
    let named = |v: Option<&Value>| {
        let mut out = Vec::new();
        if let Some(v) = v {
            names(deref(v, &nodes), &mut out);
        }
        out.into_iter().next()
    };
    let mins = |key: &str| r.get(key).and_then(Value::as_str).and_then(parse_minutes);
    let site = nodes
        .iter()
        .find(|n| has_type(n, "WebSite"))
        .and_then(|n| named(n.get("name")));

    Some(RecipeDraft {
        title: named(r.get("name")).unwrap_or_default(),
        description: r.get("description").map(lines_joined).unwrap_or_default(),
        ingredients,
        steps,
        servings: pick_servings(yield_items),
        prep_minutes: mins("prepTime"),
        cook_minutes: mins("cookTime"),
        total_minutes: mins("totalTime"),
        source_name: named(r.get("author"))
            .or_else(|| named(r.get("publisher")))
            .or(site),
        tags: tags(tag_src),
        image_url: r.get("image").and_then(|v| image_url(v, &nodes)),
        ..Default::default()
    })
}

/// Every object in the JSON-LD blocks, descending arrays and `@graph`.
fn collect_nodes<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Array(a) => a.iter().for_each(|x| collect_nodes(x, out)),
        Value::Object(o) => {
            out.push(v);
            if let Some(g) = o.get("@graph") {
                collect_nodes(g, out);
            }
        }
        _ => {}
    }
}

fn has_type(v: &Value, wanted: &str) -> bool {
    let is = |t: &str| t.rsplit(['/', '#']).next() == Some(wanted);
    match v.get("@type") {
        Some(Value::String(t)) => is(t),
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).any(is),
        _ => false,
    }
}

fn is_recipe(v: &Value) -> bool {
    has_type(v, "Recipe")
}

/// Follows a bare `{"@id": ...}` reference to the node it names in the same page (Yoast graphs do this for
/// authors and images); anything else is returned as is.
fn deref<'a>(v: &'a Value, nodes: &[&'a Value]) -> &'a Value {
    match v.as_object() {
        Some(o) if o.len() == 1 && o.contains_key("@id") => nodes
            .iter()
            .find(|n| n.get("@id") == v.get("@id") && !std::ptr::eq(**n, v))
            .copied()
            .unwrap_or(v),
        _ => v,
    }
}

/// Text values of a string / number / array / object with `name` or `text`.
fn strings(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            let s = clean(s);
            if !s.is_empty() {
                out.push(s);
            }
        }
        Value::Number(n) => out.push(n.to_string()),
        Value::Array(a) => a.iter().for_each(|x| strings(x, out)),
        Value::Object(o) => {
            if let Some(x) = o.get("text").or_else(|| o.get("name")) {
                strings(x, out);
            }
        }
        _ => {}
    }
}

/// Like [`strings`] but an author/publisher/name object yields its `name`.
fn names(v: &Value, out: &mut Vec<String>) {
    match v.get("name") {
        Some(n) => strings(n, out),
        None => strings(v, out),
    }
}

fn lines_joined(v: &Value) -> String {
    let mut out = Vec::new();
    strings(v, &mut out);
    out.join(" ")
}

/// string | ImageObject | array (first usable) | `{"@id"}` reference.
fn image_url(v: &Value, nodes: &[&Value]) -> Option<String> {
    match deref(v, nodes) {
        Value::String(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty()),
        Value::Array(a) => a.iter().find_map(|x| image_url(x, nodes)),
        Value::Object(o) => o
            .get("url")
            .or_else(|| o.get("contentUrl"))
            .and_then(|x| image_url(x, nodes)),
        _ => None,
    }
}

/// `recipeInstructions`: text (one step per line), HowToStep, or HowToSection (its name becomes `section`).
fn collect_steps(v: &Value, section: Option<&str>, out: &mut Vec<Ingredient>) {
    let push = |text: String, out: &mut Vec<Ingredient>| {
        out.push(Ingredient {
            text,
            section: section.map(str::to_string),
        })
    };
    match v {
        Value::String(s) => lines(s).into_iter().for_each(|l| push(l, out)),
        Value::Array(a) => a.iter().for_each(|x| collect_steps(x, section, out)),
        Value::Object(o) => {
            let nested = o.get("itemListElement");
            if has_type(v, "HowToSection") || (nested.is_some() && !has_type(v, "HowToStep")) {
                let name = o.get("name").map(lines_joined).filter(|s| !s.is_empty());
                if let Some(n) = nested {
                    collect_steps(n, name.as_deref().or(section), out);
                }
            } else if let Some(text) = o
                .get("text")
                .or_else(|| o.get("description"))
                .or_else(|| o.get("name"))
                .map(lines_joined)
                .filter(|s| !s.is_empty())
            {
                push(text, out);
            }
        }
        _ => {}
    }
}

// ---------- microdata ----------

/// Elements of `root`'s own scope carrying `itemprop=name` (not those of nested items such as an author Person).
fn props<'a>(root: ElementRef<'a>, name: &str) -> Vec<ElementRef<'a>> {
    root.descendants()
        .filter_map(ElementRef::wrap)
        .filter(|e| {
            e.value()
                .attr("itemprop")
                .is_some_and(|p| p.split_whitespace().any(|x| x == name))
                && e.ancestors()
                    .filter_map(ElementRef::wrap)
                    .find(|a| a.value().attr("itemscope").is_some())
                    .is_some_and(|a| a.id() == root.id())
        })
        .collect()
}

fn prop_value(e: ElementRef) -> String {
    let v = e.value();
    let attr = |a: &str| v.attr(a).map(clean);
    let text = || clean(&e.text().collect::<String>());
    let found = match v.name() {
        "meta" => attr("content"),
        "img" | "source" => attr("src"),
        "a" | "link" => attr("href"),
        "time" => attr("datetime"),
        _ if v.attr("itemscope").is_some() => props(e, "name").first().map(|n| prop_value(*n)),
        _ => attr("content"),
    };
    found.filter(|s| !s.is_empty()).unwrap_or_else(text)
}

fn first_prop(root: ElementRef, name: &str) -> Option<String> {
    props(root, name)
        .first()
        .map(|e| prop_value(*e))
        .filter(|s| !s.is_empty())
}

fn from_microdata(doc: &Html) -> Option<RecipeDraft> {
    let sel = Selector::parse("[itemscope][itemtype]").ok()?;
    let root = doc.select(&sel).find(|e| {
        e.value().attr("itemtype").is_some_and(|t| {
            t.trim()
                .trim_end_matches('/')
                .ends_with("schema.org/Recipe")
        })
    })?;
    let all = |names: &[&str]| -> Vec<String> {
        names
            .iter()
            .flat_map(|n| props(root, n))
            .map(prop_value)
            .filter(|s| !s.is_empty())
            .collect()
    };
    let item_sel = Selector::parse("li").ok()?;
    let para_sel = Selector::parse("p").ok()?;
    let mut steps: Vec<String> = Vec::new();
    for e in props(root, "recipeInstructions") {
        let items: Vec<String> = [&item_sel, &para_sel]
            .iter()
            .map(|s| {
                e.select(s)
                    .map(|x| clean(&x.text().collect::<String>()))
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
            })
            .find(|v| !v.is_empty())
            .unwrap_or_else(|| lines(&e.text().collect::<String>()));
        steps.extend(items);
    }
    let mins = |name: &str| first_prop(root, name).and_then(|s| parse_minutes(&s));
    let step = |text: String| Ingredient {
        text,
        section: None,
    };
    Some(RecipeDraft {
        title: first_prop(root, "name").unwrap_or_default(),
        description: first_prop(root, "description").unwrap_or_default(),
        ingredients: all(&["recipeIngredient", "ingredients"])
            .into_iter()
            .map(step)
            .collect(),
        steps: steps.into_iter().map(step).collect(),
        servings: pick_servings(all(&["recipeYield"])),
        prep_minutes: mins("prepTime"),
        cook_minutes: mins("cookTime"),
        total_minutes: mins("totalTime"),
        source_name: first_prop(root, "author"),
        tags: tags(all(&["keywords", "recipeCategory", "recipeCuisine"])),
        image_url: first_prop(root, "image"),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(html: &str, page: &str) -> RecipeDraft {
        extract(html, &Url::parse(page).unwrap()).expect("recipe expected")
    }

    fn texts(items: &[Ingredient]) -> Vec<&str> {
        items.iter().map(|i| i.text.as_str()).collect()
    }

    fn sections(items: &[Ingredient]) -> Vec<Option<&str>> {
        items.iter().map(|i| i.section.as_deref()).collect()
    }

    #[test]
    fn wprm_yoast_graph() {
        let d = draft(
            include_str!("../../tests/fixtures/wprm-graph.html"),
            "https://saltandthyme.example/brown-butter-pasta/",
        );
        assert_eq!(d.title, "Brown Butter Pasta with Sage");
        assert_eq!(
            d.description,
            "A 5-ingredient dinner that's ready in 20 minutes."
        );
        assert_eq!(d.ingredients.len(), 5);
        assert_eq!(d.ingredients[4].text, "Salt & black pepper");
        assert_eq!(d.steps.len(), 3);
        assert!(d.steps[1].text.starts_with("Melt the butter"));
        assert_eq!(sections(&d.steps), [None, None, None]);
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(5), Some(15), Some(20))
        );
        assert_eq!(d.servings.as_deref(), Some("4 servings"));
        assert_eq!(
            d.tags,
            [
                "brown butter",
                "pasta",
                "20 minute dinner",
                "dinner",
                "italian"
            ]
        );
        assert_eq!(
            d.image_url.as_deref(),
            Some("https://saltandthyme.example/wp-content/uploads/2024/03/brown-butter-pasta.jpg")
        );
        assert_eq!(d.source_name.as_deref(), Some("Maria Okafor")); // author via {"@id"} reference
        assert_eq!(
            d.source_url.as_deref(),
            Some("https://saltandthyme.example/brown-butter-pasta/")
        );
        assert_eq!(d.source_type, SourceType::Link);
    }

    #[test]
    fn tasty_recipes_single_object() {
        let d = draft(
            include_str!("../../tests/fixtures/tasty.html"),
            "https://weeknightwins.example/fajitas/",
        );
        assert_eq!(d.title, "Sheet Pan Chicken Fajitas");
        assert_eq!(
            d.description,
            "Everything roasts on one pan \u{2013} no stovetop splatter."
        );
        assert_eq!(d.ingredients.len(), 6);
        assert_eq!(
            texts(&d.steps)[0],
            "Heat the oven to 425\u{b0}F and line a sheet pan."
        );
        assert_eq!(d.steps.len(), 3);
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(15), Some(25), Some(40))
        );
        assert_eq!(d.servings.as_deref(), Some("4 servings"));
        assert_eq!(
            d.tags,
            [
                "fajitas",
                "sheet pan",
                "chicken",
                "easy dinner",
                "main course",
                "mexican"
            ]
        );
        assert_eq!(
            d.image_url.as_deref(),
            Some("https://weeknightwins.example/images/fajitas.jpg")
        );
        assert_eq!(d.source_name.as_deref(), Some("Dana Whitfield"));
    }

    #[test]
    fn publisher_type_array_and_string_instructions() {
        let d = draft(
            include_str!("../../tests/fixtures/publisher.html"),
            "https://dailytable.example/recipes/tomato-soup",
        );
        assert_eq!(d.title, "Slow-Roasted Tomato Soup");
        assert_eq!(d.ingredients.len(), 5);
        assert_eq!(d.steps.len(), 3);
        assert_eq!(
            d.steps[2].text,
            "Blend with the stock until smooth and season well."
        );
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(20), Some(90), Some(110))
        );
        assert_eq!(d.servings.as_deref(), Some("Serves 6"));
        assert_eq!(d.tags, ["soup", "tomato", "vegetarian", "soups"]);
        assert_eq!(
            d.image_url.as_deref(),
            Some("https://dailytable.example/images/2025/tomato-soup-superJumbo.jpg")
        );
        assert_eq!(d.source_name.as_deref(), Some("Sam Reyes"));
    }

    #[test]
    fn howto_sections_become_step_sections() {
        let d = draft(
            include_str!("../../tests/fixtures/howto-sections.html"),
            "https://flourandfork.example/cinnamon-rolls",
        );
        assert_eq!(d.title, "Weekend Cinnamon Rolls");
        assert_eq!(d.ingredients.len(), 8);
        assert_eq!(d.steps.len(), 5);
        assert_eq!(
            sections(&d.steps),
            [
                Some("Make the dough"),
                Some("Make the dough"),
                Some("Fill and bake"),
                Some("Fill and bake"),
                Some("Frost")
            ]
        );
        assert_eq!(d.steps[3].text, "Bake at 350\u{b0}F for 25 minutes.");
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(60), Some(25), Some(180))
        );
        assert_eq!(d.servings.as_deref(), Some("8"));
        assert_eq!(d.tags, ["baking", "breakfast", "brunch"]);
        assert_eq!(
            d.image_url.as_deref(),
            Some("https://cdn.flourandfork.example/rolls.webp")
        );
        assert_eq!(d.source_name.as_deref(), Some("Flour & Fork"));
    }

    #[test]
    fn microdata_only_page() {
        let d = draft(
            include_str!("../../tests/fixtures/microdata.html"),
            "https://oldpantry.example/lentil-stew/",
        );
        assert_eq!(d.title, "Grandma\u{2019}s Lentil Stew");
        assert_eq!(d.description, "A thick, cheap, filling stew.");
        assert_eq!(d.ingredients.len(), 4);
        assert_eq!(
            texts(&d.steps),
            [
                "Sweat the onion and carrots in oil.",
                "Add lentils and water; simmer 45 minutes.",
                "Season and serve with bread."
            ]
        );
        assert_eq!(
            (d.prep_minutes, d.cook_minutes, d.total_minutes),
            (Some(10), Some(45), Some(55))
        );
        assert_eq!(d.servings.as_deref(), Some("6 bowls"));
        assert_eq!(d.tags, ["lentils", "stew", "budget", "soup", "jewish"]);
        assert_eq!(
            d.image_url.as_deref(),
            Some("https://oldpantry.example/photos/lentil-stew.jpg")
        );
        assert_eq!(d.source_name.as_deref(), Some("Ruth Adler")); // the nested Person's name, not the recipe's
    }

    #[test]
    fn page_without_recipe_is_none() {
        let url = Url::parse("https://example.com/post").unwrap();
        assert!(extract(include_str!("../../tests/fixtures/no-recipe.html"), &url).is_none());
        assert!(extract("", &url).is_none());
    }

    #[test]
    fn durations() {
        for (iso, want) in [
            ("PT45M", Some(45)),
            ("PT1H30M", Some(90)),
            ("P0DT0H20M", Some(20)),
            ("P1DT2H", Some(1560)),
            ("PT0.5H", Some(30)),
            ("PT90S", Some(2)),
            ("pt10m", Some(10)),
            ("PT0M", None),
            ("P1M", None),
            ("soon", None),
            ("", None),
        ] {
            assert_eq!(parse_minutes(iso), want, "{iso}");
        }
    }

    #[test]
    fn lenient_json_and_missing_title() {
        // A raw newline inside a JSON string, and no name: the title comes from <title>.
        let html = "<title>My Soup</title><script type=\"application/ld+json\">{\"@type\":\"Recipe\",\"recipeIngredient\":[\"1 onion\nchopped\"]}</script>";
        let d = draft(html, "https://example.com/soup");
        assert_eq!(d.title, "My Soup");
        assert_eq!(d.ingredients[0].text, "1 onion chopped");
        assert_eq!(d.source_name.as_deref(), Some("example.com"));
    }
}
