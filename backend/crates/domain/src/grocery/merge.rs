//! Combining the ingredient lines of several recipes into grocery items.

use std::collections::HashMap;

use uuid::Uuid;

use super::key::plural_key;
use super::{Amount, Section, classify, parse_line};
use crate::Ingredient;

/// One recipe's contribution to the list: which recipe, at what scale, and its ingredient lines.
pub struct RecipeLines<'a> {
    pub recipe_id: Uuid,
    pub scale: f64,
    pub ingredients: &'a [Ingredient],
}

/// One merged item. `key` is the merge key; `amounts` is empty when no line gave a quantity.
#[derive(Debug, Clone, PartialEq)]
pub struct GeneratedItem {
    pub key: String,
    pub name: String,
    pub amounts: Vec<Amount>,
    pub section: Section,
    pub recipe_ids: Vec<Uuid>,
}

/// Adds `b` to `a` (same unit): min + min, max + max, a missing max counting as the min.
fn add(a: &mut Amount, b: &Amount) {
    a.max = (a.max.is_some() || b.max.is_some())
        .then(|| a.max.unwrap_or(a.min) + b.max.unwrap_or(b.min));
    a.min += b.min;
}

/// Parses every line (blank ones skipped), scales the amounts and merges by key. Amounts with the same unit (or both
/// unit-less) add up; other units sit side by side in first-seen order, with no unit conversion. The section is the
/// override for the key, else the built-in dictionary. Sorted by section, then name.
pub fn build_items(
    recipes: &[RecipeLines<'_>],
    overrides: &HashMap<String, Section>,
) -> Vec<GeneratedItem> {
    let mut items: Vec<GeneratedItem> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for recipe in recipes {
        for ingredient in recipe
            .ingredients
            .iter()
            .filter(|i| !i.text.trim().is_empty())
        {
            let line = parse_line(&ingredient.text);
            let i = *at.entry(line.key.clone()).or_insert_with(|| {
                let section = overrides
                    .get(&line.key)
                    .copied()
                    .unwrap_or_else(|| classify(&line.key));
                items.push(GeneratedItem {
                    key: line.key.clone(),
                    name: line.name.clone(),
                    amounts: vec![],
                    section,
                    recipe_ids: vec![],
                });
                items.len() - 1
            });
            let item = &mut items[i];
            if !item.recipe_ids.contains(&recipe.recipe_id) {
                item.recipe_ids.push(recipe.recipe_id);
            }
            let Some(mut amount) = line.amount else {
                continue;
            };
            amount.min *= recipe.scale;
            amount.max = amount.max.map(|m| m * recipe.scale);
            match item.amounts.iter_mut().find(|a| a.unit == amount.unit) {
                Some(existing) => add(existing, &amount),
                None => item.amounts.push(amount),
            }
        }
    }
    for item in &mut items {
        // "3 onions", "1 onion": a bare count takes the plural form above one.
        if let [
            Amount {
                min,
                max,
                unit: None,
            },
        ] = item.amounts.as_slice()
        {
            item.name = if max.unwrap_or(*min) > 1.0 {
                plural_key(&item.key)
            } else {
                item.key.clone()
            };
        }
    }
    items.sort_by_cached_key(|i| (i.section, i.name.to_lowercase()));
    items
}
