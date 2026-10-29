//! Planning a cook-together session (KIT-7): the order to cook two to four recipes' steps in so they are ready
//! together. The AI suggests a plan ([`RawPlan`]); nothing it says is trusted. [`check_plan`] accepts it only when it
//! is a complete, consistent order, and the caller falls back to [`round_robin`] otherwise.

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

/// Fewest and most recipes in one plan (the same limits as cooking together).
pub const MIN_PLAN_DISHES: usize = 2;
pub const MAX_PLAN_DISHES: usize = 4;
/// Most steps, all recipes together, worth asking the AI to plan; more are taken in turn without asking.
pub const MAX_PLAN_STEPS: usize = 80;
/// Longest step text sent to the AI, in characters; a longer step is cut (the order needs the gist, not every word).
pub const MAX_PLAN_STEP_CHARS: usize = 400;
/// Longest recipe title sent to the AI.
pub const MAX_PLAN_TITLE_CHARS: usize = 120;
/// Longest note kept from the AI for one step.
pub const MAX_PLAN_NOTE_CHARS: usize = 200;
/// No plan runs longer than a day.
pub const MAX_PLAN_MINUTES: i32 = 24 * 60;

/// One recipe as the planner sees it: its id, title, steps in order and the times it states.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanDish {
    pub recipe_id: Uuid,
    pub title: String,
    pub steps: Vec<String>,
    pub prep_minutes: Option<i32>,
    pub cook_minutes: Option<i32>,
    pub total_minutes: Option<i32>,
}

/// One step as the AI proposed it, read leniently: any field may be missing or of the wrong type.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProposedStep {
    pub recipe_id: Option<String>,
    pub step_index: Option<f64>,
    pub start_offset_min: Option<f64>,
    pub note: Option<String>,
}

/// The AI's plan as it came back, before any check.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawPlan {
    pub steps: Vec<ProposedStep>,
    /// Minutes from the first step until everything is ready to serve.
    pub total_minutes: Option<f64>,
}

/// One step of a checked plan. `step_index` is 0-based into the recipe's steps.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedStep {
    pub recipe_id: Uuid,
    pub step_index: usize,
    /// Minutes after the start; `None` in a round-robin order (no timing known).
    pub start_offset_min: Option<i32>,
    /// One short sentence from the AI, or empty. Plain text, never markup.
    pub note: String,
    /// The clock time to start, when the cook gave a serve time and the plan is timed (see [`schedule`]).
    pub start_at: Option<DateTime<Utc>>,
}

/// Where a plan came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanSource {
    Ai,
    RoundRobin,
}

/// A plan the cook can use: every step of every recipe exactly once.
#[derive(Debug, Clone, PartialEq)]
pub struct CookPlan {
    pub source: PlanSource,
    /// Why the order is round-robin rather than the AI's; `None` for an AI plan.
    pub reason: Option<String>,
    /// Minutes from the first step until serving; `None` in a round-robin order.
    pub total_minutes: Option<i32>,
    pub steps: Vec<PlannedStep>,
    /// The serve time the cook asked for, echoed back; `None` when none was given.
    pub serve_at: Option<DateTime<Utc>>,
}

/// Why an AI plan was not used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanProblem {
    /// Too many steps to ask about.
    TooManySteps,
    /// None of the recipes has a step.
    NoSteps,
    /// A step is missing, repeated, unknown or out of its recipe's order.
    Incomplete,
    /// A start time is missing, negative, past a day, or earlier than the step before.
    BadTiming,
}

impl PlanProblem {
    /// What the cook is told, in the response's `reason`.
    pub fn message(self) -> &'static str {
        match self {
            Self::TooManySteps => {
                "There are too many steps to plan, so the dishes take turns, one step each."
            }
            Self::NoSteps => "These recipes have no steps yet, so there is nothing to plan.",
            Self::Incomplete | Self::BadTiming => {
                "The suggested order didn't add up, so the dishes take turns, one step each."
            }
        }
    }
}

/// Every dish's first step in dish order, then every dish's second step, and so on, skipping dishes that have run
/// out: the order cooking together starts with.
pub fn round_robin(dishes: &[PlanDish]) -> Vec<PlannedStep> {
    let longest = dishes.iter().map(|d| d.steps.len()).max().unwrap_or(0);
    (0..longest)
        .flat_map(|step| {
            dishes
                .iter()
                .filter(move |d| step < d.steps.len())
                .map(move |d| PlannedStep {
                    recipe_id: d.recipe_id,
                    step_index: step,
                    start_offset_min: None,
                    note: String::new(),
                    start_at: None,
                })
        })
        .collect()
}

/// The round-robin plan, saying why.
pub fn fallback(dishes: &[PlanDish], problem: PlanProblem) -> CookPlan {
    CookPlan {
        source: PlanSource::RoundRobin,
        reason: Some(problem.message().into()),
        total_minutes: None,
        steps: round_robin(dishes),
        serve_at: None,
    }
}

/// Sets `serve_at` and, for a timed plan, each step's `start_at`: the serve time less the plan's total, plus the step's
/// offset. A round-robin plan has no timing, so only `serve_at` is set.
pub fn schedule(mut plan: CookPlan, serve_at: Option<DateTime<Utc>>) -> CookPlan {
    plan.serve_at = serve_at;
    let (Some(serve), Some(total)) = (serve_at, plan.total_minutes) else {
        return plan;
    };
    let start = serve.checked_sub_signed(Duration::minutes(total.into()));
    for s in &mut plan.steps {
        s.start_at = start
            .zip(s.start_offset_min)
            .and_then(|(t, m)| t.checked_add_signed(Duration::minutes(m.into())));
    }
    plan
}

/// A whole number of minutes in `0..=MAX_PLAN_MINUTES`, or `None`.
fn minutes(v: Option<f64>) -> Option<i32> {
    let v = v?;
    (v.is_finite() && (0.0..=f64::from(MAX_PLAN_MINUTES)).contains(&v)).then(|| v.round() as i32)
}

/// A note as plain text on one line: control and format characters (bidi overrides, zero-width) dropped, whitespace
/// collapsed, cut to [`MAX_PLAN_NOTE_CHARS`].
pub fn clean_note(raw: &str) -> String {
    let kept: String = raw
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .filter(|c| !c.is_control() && !is_format(*c))
        .collect();
    let mut note = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    if let Some((i, _)) = note.char_indices().nth(MAX_PLAN_NOTE_CHARS) {
        note.truncate(i);
        note = note.trim_end().to_string();
    }
    note
}

/// Unicode format characters that can reorder or hide text (Cf: bidi controls, zero-width joiners, BOM).
fn is_format(c: char) -> bool {
    matches!(c, '\u{00AD}' | '\u{061C}' | '\u{180E}' | '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{206F}' | '\u{FEFF}' | '\u{FFF9}'..='\u{FFFB}')
}

/// The AI's plan when it is usable: every step of every dish exactly once, each recipe's steps in their own order,
/// recipe ids from `dishes` only, and start offsets present, within a day and never earlier than the step before.
/// Notes are cleaned ([`clean_note`]). `total_minutes` is kept when it is a sensible number no earlier than the last
/// start, and is the last start otherwise.
pub fn check_plan(dishes: &[PlanDish], raw: &RawPlan) -> Result<CookPlan, PlanProblem> {
    let expected: usize = dishes.iter().map(|d| d.steps.len()).sum();
    if raw.steps.len() != expected {
        return Err(PlanProblem::Incomplete);
    }
    // Each entry must be its dish's next unseen step: that covers range, repeats, gaps and order together.
    let mut next = vec![0usize; dishes.len()];
    let mut steps = Vec::with_capacity(expected);
    let mut last = 0;
    for p in &raw.steps {
        let id = p
            .recipe_id
            .as_deref()
            .and_then(|s| Uuid::parse_str(s.trim()).ok())
            .ok_or(PlanProblem::Incomplete)?;
        let dish = dishes
            .iter()
            .position(|d| d.recipe_id == id)
            .ok_or(PlanProblem::Incomplete)?;
        let index = p
            .step_index
            .filter(|i| i.fract() == 0.0 && *i >= 0.0)
            .ok_or(PlanProblem::Incomplete)? as usize;
        if index != next[dish] || index >= dishes[dish].steps.len() {
            return Err(PlanProblem::Incomplete);
        }
        next[dish] += 1;
        let offset = minutes(p.start_offset_min).ok_or(PlanProblem::BadTiming)?;
        if offset < last {
            return Err(PlanProblem::BadTiming);
        }
        last = offset;
        steps.push(PlannedStep {
            recipe_id: id,
            step_index: index,
            start_offset_min: Some(offset),
            note: clean_note(p.note.as_deref().unwrap_or("")),
            start_at: None,
        });
    }
    let total = minutes(raw.total_minutes)
        .filter(|t| *t >= last)
        .unwrap_or(last);
    Ok(CookPlan {
        source: PlanSource::Ai,
        reason: None,
        total_minutes: Some(total),
        steps,
        serve_at: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dish(n: u128, steps: usize) -> PlanDish {
        PlanDish {
            recipe_id: Uuid::from_u128(n),
            title: format!("Dish {n}"),
            steps: (0..steps).map(|i| format!("step {i}")).collect(),
            prep_minutes: None,
            cook_minutes: None,
            total_minutes: None,
        }
    }

    fn step(n: u128, index: f64, offset: f64) -> ProposedStep {
        ProposedStep {
            recipe_id: Some(Uuid::from_u128(n).to_string()),
            step_index: Some(index),
            start_offset_min: Some(offset),
            note: None,
        }
    }

    fn plan(steps: Vec<ProposedStep>) -> RawPlan {
        RawPlan {
            steps,
            total_minutes: Some(60.0),
        }
    }

    #[test]
    fn round_robin_takes_turns_and_skips_dishes_that_ran_out() {
        let order: Vec<_> = round_robin(&[dish(1, 3), dish(2, 1), dish(3, 2)])
            .into_iter()
            .map(|s| (s.recipe_id.as_u128(), s.step_index, s.start_offset_min))
            .collect();
        assert_eq!(
            order,
            [
                (1, 0, None),
                (2, 0, None),
                (3, 0, None),
                (1, 1, None),
                (3, 1, None),
                (1, 2, None)
            ]
        );
        assert!(round_robin(&[]).is_empty());
    }

    #[test]
    fn a_complete_plan_is_kept_with_its_timing_and_cleaned_notes() {
        let dishes = [dish(1, 2), dish(2, 1)];
        let mut first = step(2, 0.0, 0.0);
        first.note = Some("  Start the roast\nfirst.\u{202E}  ".into());
        let p = check_plan(
            &dishes,
            &plan(vec![first, step(1, 0.0, 10.4), step(1, 1.0, 10.0)]),
        )
        .unwrap();
        assert_eq!(p.source, PlanSource::Ai);
        assert_eq!(p.reason, None);
        assert_eq!(p.total_minutes, Some(60));
        let got: Vec<_> = p
            .steps
            .iter()
            .map(|s| (s.recipe_id.as_u128(), s.step_index, s.start_offset_min))
            .collect();
        assert_eq!(got, [(2, 0, Some(0)), (1, 0, Some(10)), (1, 1, Some(10))]);
        assert_eq!(p.steps[0].note, "Start the roast first.");
        assert_eq!(p.steps[1].note, "");
    }

    #[test]
    fn total_is_never_before_the_last_start() {
        let dishes = [dish(1, 1), dish(2, 1)];
        for (total, want) in [
            (Some(5.0), 30),
            (None, 30),
            (Some(f64::NAN), 30),
            (Some(-1.0), 30),
            (Some(45.0), 45),
        ] {
            let p = check_plan(
                &dishes,
                &RawPlan {
                    steps: vec![step(1, 0.0, 0.0), step(2, 0.0, 30.0)],
                    total_minutes: total,
                },
            )
            .unwrap();
            assert_eq!(p.total_minutes, Some(want), "{total:?}");
        }
    }

    #[test]
    fn malformed_plans_are_refused() {
        let dishes = [dish(1, 2), dish(2, 1)];
        let good = || vec![step(1, 0.0, 0.0), step(2, 0.0, 5.0), step(1, 1.0, 10.0)];
        let mut cases: Vec<(&str, Vec<ProposedStep>, PlanProblem)> = vec![
            ("empty", vec![], PlanProblem::Incomplete),
            (
                "missing a step",
                good()[..2].to_vec(),
                PlanProblem::Incomplete,
            ),
            (
                "a step twice",
                vec![step(1, 0.0, 0.0), step(1, 0.0, 5.0), step(2, 0.0, 10.0)],
                PlanProblem::Incomplete,
            ),
            (
                "out of the recipe's order",
                vec![step(1, 1.0, 0.0), step(2, 0.0, 5.0), step(1, 0.0, 10.0)],
                PlanProblem::Incomplete,
            ),
            (
                "an extra step",
                [good(), vec![step(2, 1.0, 20.0)]].concat(),
                PlanProblem::Incomplete,
            ),
            (
                "a step past the end",
                vec![step(1, 0.0, 0.0), step(2, 1.0, 5.0), step(1, 1.0, 10.0)],
                PlanProblem::Incomplete,
            ),
            (
                "an unknown recipe",
                vec![step(1, 0.0, 0.0), step(3, 0.0, 5.0), step(1, 1.0, 10.0)],
                PlanProblem::Incomplete,
            ),
            (
                "a fractional index",
                vec![step(1, 0.0, 0.0), step(2, 0.5, 5.0), step(1, 1.0, 10.0)],
                PlanProblem::Incomplete,
            ),
            (
                "a negative offset",
                vec![step(1, 0.0, -1.0), step(2, 0.0, 5.0), step(1, 1.0, 10.0)],
                PlanProblem::BadTiming,
            ),
            (
                "going back in time",
                vec![step(1, 0.0, 0.0), step(2, 0.0, 20.0), step(1, 1.0, 10.0)],
                PlanProblem::BadTiming,
            ),
            (
                "past a day",
                vec![step(1, 0.0, 0.0), step(2, 0.0, 5.0), step(1, 1.0, 1441.0)],
                PlanProblem::BadTiming,
            ),
        ];
        let mut no_id = good();
        no_id[1].recipe_id = None;
        cases.push(("no recipe id", no_id, PlanProblem::Incomplete));
        let mut bad_id = good();
        bad_id[1].recipe_id = Some("not-a-uuid".into());
        cases.push(("a malformed id", bad_id, PlanProblem::Incomplete));
        let mut no_offset = good();
        no_offset[2].start_offset_min = None;
        cases.push(("no offset", no_offset, PlanProblem::BadTiming));
        let mut no_index = good();
        no_index[0].step_index = None;
        cases.push(("no index", no_index, PlanProblem::Incomplete));
        for (what, steps, want) in cases {
            assert_eq!(check_plan(&dishes, &plan(steps)), Err(want), "{what}");
        }
    }

    #[test]
    fn notes_are_one_line_of_plain_text_and_capped() {
        assert_eq!(clean_note(" a\t b\r\n\u{0007}c\u{200B}d "), "a b cd");
        let long = clean_note(&"é".repeat(MAX_PLAN_NOTE_CHARS + 50));
        assert_eq!(long.chars().count(), MAX_PLAN_NOTE_CHARS);
        assert_eq!(
            clean_note("<b>hi</b>"),
            "<b>hi</b>",
            "kept as text; the UI escapes it"
        );
    }

    #[test]
    fn a_serve_time_gives_each_step_a_clock_time() {
        let dishes = [dish(1, 1), dish(2, 1)];
        let serve = DateTime::<Utc>::from_timestamp(1_800_000_000, 0).unwrap();
        let p = check_plan(&dishes, &plan(vec![step(1, 0.0, 0.0), step(2, 0.0, 45.0)])).unwrap();
        let p = schedule(p, Some(serve));
        assert_eq!(p.serve_at, Some(serve));
        let starts: Vec<_> = p.steps.iter().map(|s| s.start_at).collect();
        assert_eq!(
            starts,
            [
                Some(serve - Duration::minutes(60)),
                Some(serve - Duration::minutes(15))
            ]
        );
        let none = schedule(
            check_plan(&dishes, &plan(vec![step(1, 0.0, 0.0), step(2, 0.0, 1.0)])).unwrap(),
            None,
        );
        assert!(none.steps.iter().all(|s| s.start_at.is_none()));
        let rr = schedule(fallback(&dishes, PlanProblem::Incomplete), Some(serve));
        assert_eq!(rr.serve_at, Some(serve));
        assert!(rr.steps.iter().all(|s| s.start_at.is_none()));
        // At the edge of what a date can hold nothing overflows.
        let edge = schedule(
            check_plan(&dishes, &plan(vec![step(1, 0.0, 0.0), step(2, 0.0, 1.0)])).unwrap(),
            Some(DateTime::<Utc>::MIN_UTC),
        );
        assert!(edge.steps.iter().all(|s| s.start_at.is_none()));
    }

    #[test]
    fn the_fallback_says_why() {
        let p = fallback(&[dish(1, 1), dish(2, 1)], PlanProblem::TooManySteps);
        assert_eq!(p.source, PlanSource::RoundRobin);
        assert_eq!(p.total_minutes, None);
        assert_eq!(p.steps.len(), 2);
        assert!(p.reason.unwrap().contains("too many steps"));
    }
}
