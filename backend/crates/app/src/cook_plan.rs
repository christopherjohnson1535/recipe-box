//! Planning a cook-together session with AI (KIT-7): which order to cook two to four recipes' steps in so they are
//! ready together. The AI's plan is checked ([`domain::cook_plan::check_plan`]); when it does not add up, or the
//! recipes have too many steps to ask about, the answer is the round-robin order with the reason, never an error.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use domain::{
    AiProvider, DomainError, DomainResult,
    chrono::{DateTime, Duration, Utc},
    cook_plan::{
        CookPlan, MAX_PLAN_DISHES, MAX_PLAN_STEPS, MIN_PLAN_DISHES, PlanDish, PlanProblem,
        check_plan, fallback, schedule,
    },
    uuid::Uuid,
};
use ports::{Clock, RecipeExtractor, RecipeRepo};

use crate::Deps;

/// Plans one member may ask for in [`WINDOW_SECS`]; each is a paid AI call.
pub const PLANS_PER_WINDOW: usize = 10;
pub const WINDOW_SECS: i64 = 10 * 60;

/// Recent plan requests per member, in this process only.
///
/// shortcut: in-memory like the password throttle; a restart forgets it, which is fine for one household on one API
/// container. Move it behind a port if a second API instance ever runs.
#[derive(Debug, Default)]
pub struct PlanLimiter {
    recent: Mutex<HashMap<Uuid, Vec<DateTime<Utc>>>>,
}

impl PlanLimiter {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Counts a request by `user`, or refuses it with the whole seconds until one is free again (at least 1).
    fn take(&self, user: Uuid, now: DateTime<Utc>) -> Result<(), u64> {
        let window = Duration::seconds(WINDOW_SECS);
        let mut recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent.retain(|_, times| {
            times.retain(|t| now - *t < window);
            !times.is_empty()
        });
        let times = recent.entry(user).or_default();
        if times.len() >= PLANS_PER_WINDOW {
            let free_at = times[0] + window;
            let wait = (free_at - now).num_milliseconds().max(1);
            return Err(u64::try_from((wait + 999) / 1000).unwrap_or(1));
        }
        times.push(now);
        Ok(())
    }
}

/// `POST /api/cook/plan`. Its limiter is its own: the server builds the services once, so it is one per process.
#[derive(Clone)]
pub struct CookPlanService {
    extractor: Arc<dyn RecipeExtractor>,
    recipes: Arc<dyn RecipeRepo>,
    clock: Arc<dyn Clock>,
    limiter: Arc<PlanLimiter>,
}

impl CookPlanService {
    pub(crate) fn new(d: &Deps) -> Self {
        Self {
            extractor: d.extractor.clone(),
            recipes: d.recipes.clone(),
            clock: d.clock.clone(),
            limiter: PlanLimiter::new(),
        }
    }

    /// Suggests the order to cook `recipe_ids` in (KIT-7). In order: `AiDisabled` when no AI provider is configured
    /// (nothing else is looked at); `Validation` for fewer than two or more than four distinct ids; `NotFound` when one
    /// is missing or deleted; `RateLimited` past [`PLANS_PER_WINDOW`] plans in [`WINDOW_SECS`] for `user`; `Ai` when
    /// the provider fails. A plan that does not add up, or recipes with more than [`MAX_PLAN_STEPS`] steps in all,
    /// give the round-robin order with a reason instead (the latter without asking the AI).
    /// With `serve_at`, a timed plan's steps carry their clock times ([`schedule`]).
    pub async fn plan(
        &self,
        user: Uuid,
        recipe_ids: &[Uuid],
        serve_at: Option<DateTime<Utc>>,
    ) -> DomainResult<CookPlan> {
        self.plan_unscheduled(user, recipe_ids)
            .await
            .map(|p| schedule(p, serve_at))
    }

    async fn plan_unscheduled(&self, user: Uuid, recipe_ids: &[Uuid]) -> DomainResult<CookPlan> {
        if self.extractor.provider() == AiProvider::None {
            return Err(DomainError::AiDisabled);
        }
        let too_many_or_few = || {
            DomainError::validation(format!(
                "recipeIds: choose {MIN_PLAN_DISHES} to {MAX_PLAN_DISHES} different recipes."
            ))
        };
        // Stops at the first id past the limit, so a body full of ids costs nothing to refuse.
        let mut ids: Vec<Uuid> = Vec::with_capacity(MAX_PLAN_DISHES);
        for id in recipe_ids {
            if !ids.contains(id) {
                if ids.len() == MAX_PLAN_DISHES {
                    return Err(too_many_or_few());
                }
                ids.push(*id);
            }
        }
        if ids.len() < MIN_PLAN_DISHES {
            return Err(too_many_or_few());
        }
        let found = self.recipes.get_many(&ids).await?;
        if found.len() != ids.len() {
            return Err(DomainError::NotFound(
                "One of those recipes is no longer in the box.".into(),
            ));
        }
        let dishes: Vec<PlanDish> = found
            .into_iter()
            .map(|r| PlanDish {
                recipe_id: r.id,
                title: r.title,
                steps: r.steps.into_iter().map(|s| s.text).collect(),
                prep_minutes: r.prep_minutes,
                cook_minutes: r.cook_minutes,
                total_minutes: r.total_minutes,
            })
            .collect();
        let steps: usize = dishes.iter().map(|d| d.steps.len()).sum();
        if steps > MAX_PLAN_STEPS {
            return Ok(fallback(&dishes, PlanProblem::TooManySteps));
        }
        if steps == 0 {
            // Nothing to order; not worth a paid call.
            return Ok(fallback(&dishes, PlanProblem::NoSteps));
        }
        self.limiter
            .take(user, self.clock.now())
            .map_err(|retry_after_secs| DomainError::RateLimited { retry_after_secs })?;
        let raw = self.extractor.plan_cook(&dishes).await?;
        Ok(check_plan(&dishes, &raw).unwrap_or_else(|problem| fallback(&dishes, problem)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_limiter_allows_a_window_full_then_says_how_long_to_wait() {
        let l = PlanLimiter::default();
        let (me, you) = (Uuid::from_u128(1), Uuid::from_u128(2));
        let t0 = DateTime::<Utc>::from_timestamp(1_000_000, 0).unwrap();
        for i in 0..PLANS_PER_WINDOW {
            assert!(l.take(me, t0 + Duration::seconds(i as i64)).is_ok());
        }
        let later = t0 + Duration::seconds(60);
        assert_eq!(l.take(me, later), Err((WINDOW_SECS - 60) as u64));
        assert!(l.take(you, later).is_ok(), "counted per member");
        // Once the first request leaves the window there is room for one more.
        assert!(l.take(me, t0 + Duration::seconds(WINDOW_SECS)).is_ok());
        assert!(l.take(me, t0 + Duration::seconds(WINDOW_SECS)).is_err());
    }
}
