//! Grocery list logic: read an ingredient line, merge lines from several recipes, file items under store sections.
//! Pure code with no I/O. The quantity and unit rules mirror `frontend/src/lib/scale.ts`; the shared fixture
//! `tests/fixtures/ingredient-lines.json` is read by tests on both sides to keep them in step.

mod format;
mod key;
mod merge;
mod parse;
mod sections;

use serde::{Deserialize, Serialize};

pub use format::{format_amount_quantity, format_quantity};
pub use key::merge_key;
pub use merge::{GeneratedItem, RecipeLines, build_items};
pub use parse::{ParsedLine, parse_line, scale_servings};
pub use sections::classify;

/// Longest manual item text (API: 1-200 characters after trimming).
pub const MAX_GROCERY_TEXT_CHARS: usize = 200;
/// Smallest and largest recipe scale a list accepts.
pub const MIN_SCALE: f64 = 0.25;
pub const MAX_SCALE: f64 = 10.0;

/// Store sections in shopping order; `Ord` follows declaration order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Section {
    Produce,
    Meat,
    Fridge,
    Freezer,
    Pantry,
    Other,
}

impl Section {
    pub const ALL: [Section; 6] = [
        Section::Produce,
        Section::Meat,
        Section::Fridge,
        Section::Freezer,
        Section::Pantry,
        Section::Other,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Section::Produce => "produce",
            Section::Meat => "meat",
            Section::Fridge => "fridge",
            Section::Freezer => "freezer",
            Section::Pantry => "pantry",
            Section::Other => "other",
        }
    }

    /// Exact lower-case name, as stored and sent by the API.
    pub fn parse(s: &str) -> Option<Section> {
        Section::ALL.into_iter().find(|x| x.as_str() == s)
    }
}

impl std::fmt::Display for Section {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// One amount: `min..=max` (`max` None = exact) in a canonical unit, or unit-less (a count: "2 onions").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Amount {
    pub min: f64,
    pub max: Option<f64>,
    pub unit: Option<String>,
}
