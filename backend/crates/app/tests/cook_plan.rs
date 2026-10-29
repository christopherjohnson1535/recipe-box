//! `CookPlanService` (KIT-7) on the in-memory store with a scripted AI: validation, AI off, fallback to round-robin
//! for malformed plans, the step cap, scheduling and the per-member limit.

#[allow(dead_code)] // shared with the other test files
mod common;

use std::sync::Arc;

use adapter_memory::{
    FakeImageCodec, FakePasswordHasher, FakeSessionTokens, MemoryMedia, MemoryStore,
};
use app::{Deps, PLANS_PER_WINDOW, Services, WINDOW_SECS};
use common::{CollectingSpawner, FakeExtractor, FakeFetcher, FakeReader};
use domain::{
    AiProvider, DomainError, Ingredient, RecipeInput,
    chrono::{DateTime, Duration, Utc},
    cook_plan::{MAX_PLAN_STEPS, PlanDish, PlanSource, ProposedStep, RawPlan},
    uuid::Uuid,
};
use ports::{RecipeRepo, contract::ManualClock};

struct World {
    services: Services,
    store: Arc<MemoryStore>,
    clock: Arc<ManualClock>,
    extractor: Arc<FakeExtractor>,
    user: Uuid,
}

impl World {
    fn with(extractor: FakeExtractor) -> Self {
        let clock = Arc::new(ManualClock::new());
        let store = Arc::new(MemoryStore::new(clock.clone()));
        let extractor = Arc::new(extractor);
        let services = Services::new(Deps {
            recipes: store.clone(),
            images: store.clone(),
            users: store.clone(),
            sessions: store.clone(),
            settings: store.clone(),
            tags: store.clone(),
            grocery: store.clone(),
            google_connections: store.clone(),
            identities: store.clone(),
            cook_log: store.clone(),
            favourites: store.clone(),
            google_signin: Arc::new(app::DisabledGoogleSignIn),
            flows: Arc::new(app::DisabledGoogleSignIn),
            health: store.clone(),
            media: Arc::new(MemoryMedia::default()),
            backup: Arc::new(adapter_memory::MemoryBackup::default()),
            hasher: Arc::new(FakePasswordHasher::default()),
            tokens: Arc::new(FakeSessionTokens::default()),
            codec: Arc::new(FakeImageCodec::default()),
            clock: clock.clone(),
            extractor: extractor.clone(),
            fetcher: Arc::new(FakeFetcher::default()),
            reader: Arc::new(FakeReader::default()),
            google: Arc::new(app::DisabledGoogleTasks),
            cipher: Arc::new(adapter_memory::FakeTokenCipher),
            spawner: Arc::new(CollectingSpawner::default()),
            max_upload_bytes: 1 << 20,
            session_days: 30,
            throttle: app::Throttle::new(),
        });
        Self {
            services,
            store,
            clock,
            extractor,
            user: Uuid::new_v4(),
        }
    }

    async fn recipe(&self, title: &str, steps: usize) -> Uuid {
        self.store
            .create(
                self.user,
                RecipeInput {
                    title: title.into(),
                    steps: (0..steps)
                        .map(|i| Ingredient {
                            text: format!("{title} step {i}"),
                            section: None,
                        })
                        .collect(),
                    cook_minutes: Some(90),
                    ..Default::default()
                },
            )
            .await
            .unwrap()
            .id
    }
}

/// An AI that answers with `steps(dishes)` and a total of 120 minutes.
fn ai(steps: impl Fn(&[PlanDish]) -> Vec<ProposedStep> + Send + Sync + 'static) -> FakeExtractor {
    FakeExtractor {
        plan: Box::new(move |dishes| {
            Ok(RawPlan {
                steps: steps(dishes),
                total_minutes: Some(120.0),
            })
        }),
        ..FakeExtractor::on()
    }
}

fn proposed(d: &PlanDish, index: usize, offset: f64) -> ProposedStep {
    ProposedStep {
        recipe_id: Some(d.recipe_id.to_string()),
        step_index: Some(index as f64),
        start_offset_min: Some(offset),
        note: Some(format!("Note for {} {index}", d.title)),
    }
}

/// The second dish (the slow one) first, then the first dish.
fn slow_first(dishes: &[PlanDish]) -> Vec<ProposedStep> {
    let (a, b) = (&dishes[0], &dishes[1]);
    let mut out: Vec<_> = (0..b.steps.len())
        .map(|i| proposed(b, i, i as f64 * 10.0))
        .collect();
    out.extend((0..a.steps.len()).map(|i| proposed(a, i, 60.0 + i as f64)));
    out
}

fn order(plan: &domain::cook_plan::CookPlan) -> Vec<(Uuid, usize)> {
    plan.steps
        .iter()
        .map(|s| (s.recipe_id, s.step_index))
        .collect()
}

#[tokio::test]
async fn a_good_plan_is_returned_as_the_ai_ordered_it() {
    let w = World::with(ai(slow_first));
    let salad = w.recipe("Salad", 2).await;
    let roast = w.recipe("Roast", 2).await;
    let plan = w
        .services
        .cook_plan
        .plan(w.user, &[salad, roast], None)
        .await
        .unwrap();
    assert_eq!(plan.source, PlanSource::Ai);
    assert_eq!(plan.reason, None);
    assert_eq!(plan.total_minutes, Some(120));
    assert_eq!(
        order(&plan),
        [(roast, 0), (roast, 1), (salad, 0), (salad, 1)]
    );
    assert_eq!(plan.steps[0].note, "Note for Roast 0");
    // The AI saw the recipes in the order asked, with their steps and stated times.
    let seen = w.extractor.seen_plans.lock().unwrap().clone();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0][0].title, "Salad");
    assert_eq!(seen[0][1].steps, ["Roast step 0", "Roast step 1"]);
    assert_eq!(seen[0][1].cook_minutes, Some(90));
}

#[tokio::test]
async fn a_serve_time_gives_clock_times() {
    let w = World::with(ai(slow_first));
    let salad = w.recipe("Salad", 1).await;
    let roast = w.recipe("Roast", 1).await;
    let serve = DateTime::<Utc>::from_timestamp(1_800_000_000, 0).unwrap();
    let plan = w
        .services
        .cook_plan
        .plan(w.user, &[salad, roast], Some(serve))
        .await
        .unwrap();
    assert_eq!(plan.serve_at, Some(serve));
    assert_eq!(plan.steps[0].start_at, Some(serve - Duration::minutes(120)));
    assert_eq!(plan.steps[1].start_at, Some(serve - Duration::minutes(60)));
}

#[tokio::test]
async fn malformed_plans_fall_back_to_round_robin_with_a_reason() {
    type Bad = fn(&[PlanDish]) -> Vec<ProposedStep>;
    let cases: [(&str, Bad); 6] = [
        ("empty", |_| vec![]),
        ("a step missing", |d| slow_first(d)[1..].to_vec()),
        ("a step twice", |d| {
            let mut s = slow_first(d);
            s[1] = s[0].clone();
            s
        }),
        ("a stranger's recipe", |d| {
            let mut s = slow_first(d);
            s[0].recipe_id = Some(Uuid::new_v4().to_string());
            s
        }),
        ("time going backwards", |d| {
            let mut s = slow_first(d);
            s[3].start_offset_min = Some(0.0);
            s
        }),
        ("a recipe's steps swapped", |d| {
            let mut s = slow_first(d);
            s.swap(0, 1);
            s[0].start_offset_min = Some(0.0);
            s
        }),
    ];
    for (what, bad) in cases {
        let w = World::with(ai(bad));
        let salad = w.recipe("Salad", 2).await;
        let roast = w.recipe("Roast", 2).await;
        let plan = w
            .services
            .cook_plan
            .plan(w.user, &[salad, roast], None)
            .await
            .unwrap();
        assert_eq!(plan.source, PlanSource::RoundRobin, "{what}");
        assert!(
            plan.reason.as_deref().unwrap().contains("take turns"),
            "{what}"
        );
        assert_eq!(plan.total_minutes, None, "{what}");
        assert_eq!(
            order(&plan),
            [(salad, 0), (roast, 0), (salad, 1), (roast, 1)],
            "{what}"
        );
        assert!(
            plan.steps
                .iter()
                .all(|s| s.note.is_empty() && s.start_offset_min.is_none())
        );
    }
}

#[tokio::test]
async fn too_many_steps_are_not_sent_to_the_ai() {
    let w = World::with(ai(slow_first));
    let a = w.recipe("A", MAX_PLAN_STEPS / 2 + 1).await;
    let b = w.recipe("B", MAX_PLAN_STEPS / 2).await;
    let plan = w
        .services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap();
    assert_eq!(plan.source, PlanSource::RoundRobin);
    assert!(plan.reason.unwrap().contains("too many steps"));
    assert_eq!(plan.steps.len(), MAX_PLAN_STEPS + 1);
    assert!(w.extractor.seen_plans.lock().unwrap().is_empty());
}

#[tokio::test]
async fn recipes_without_steps_are_not_sent_and_say_so() {
    let w = World::with(ai(slow_first));
    let a = w.recipe("A", 0).await;
    let b = w.recipe("B", 0).await;
    let plan = w
        .services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap();
    assert_eq!(plan.source, PlanSource::RoundRobin);
    assert!(plan.steps.is_empty());
    assert!(plan.reason.unwrap().contains("no steps"));
    assert!(w.extractor.seen_plans.lock().unwrap().is_empty());
}

#[tokio::test]
async fn ai_off_is_refused_before_anything_else() {
    let w = World::with(FakeExtractor {
        provider: AiProvider::None,
        ..FakeExtractor::on()
    });
    // Not even a valid request: AI off is the answer whatever is asked.
    let err = w
        .services
        .cook_plan
        .plan(w.user, &[], None)
        .await
        .unwrap_err();
    assert!(matches!(err, DomainError::AiDisabled), "{err:?}");
}

#[tokio::test]
async fn the_recipes_are_checked() {
    let w = World::with(ai(slow_first));
    let a = w.recipe("A", 1).await;
    let b = w.recipe("B", 1).await;
    let five: Vec<Uuid> = {
        let mut v = vec![a, b];
        for t in ["C", "D", "E"] {
            v.push(w.recipe(t, 1).await);
        }
        v
    };
    for (what, ids) in [("one", vec![a]), ("one twice", vec![a, a]), ("five", five)] {
        let err = w
            .services
            .cook_plan
            .plan(w.user, &ids, None)
            .await
            .unwrap_err();
        assert!(
            matches!(&err, DomainError::Validation(m) if m.starts_with("recipeIds:")),
            "{what}: {err:?}"
        );
    }
    // A body full of ids is refused at the fifth distinct one, whatever follows.
    let many: Vec<Uuid> = (0..100_000).map(|_| Uuid::new_v4()).collect();
    let err = w
        .services
        .cook_plan
        .plan(w.user, &many, None)
        .await
        .unwrap_err();
    assert!(matches!(&err, DomainError::Validation(_)), "{err:?}");
    let err = w
        .services
        .cook_plan
        .plan(w.user, &[a, Uuid::new_v4()], None)
        .await
        .unwrap_err();
    assert!(matches!(err, DomainError::NotFound(_)), "{err:?}");
    w.store.soft_delete(b).await.unwrap();
    let err = w
        .services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap_err();
    assert!(matches!(err, DomainError::NotFound(_)), "{err:?}");
    assert!(w.extractor.seen_plans.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_provider_failure_is_an_error_not_a_fallback() {
    let w = World::with(FakeExtractor {
        plan: Box::new(|_| Err(DomainError::Ai("The AI service is busy.".into()))),
        ..FakeExtractor::on()
    });
    let a = w.recipe("A", 1).await;
    let b = w.recipe("B", 1).await;
    let err = w
        .services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap_err();
    assert!(matches!(err, DomainError::Ai(_)), "{err:?}");
}

#[tokio::test]
async fn each_member_is_limited_and_the_limit_lifts() {
    let w = World::with(ai(slow_first));
    let a = w.recipe("A", 1).await;
    let b = w.recipe("B", 1).await;
    for _ in 0..PLANS_PER_WINDOW {
        w.services
            .cook_plan
            .plan(w.user, &[a, b], None)
            .await
            .unwrap();
    }
    let err = w
        .services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap_err();
    assert!(
        matches!(err, DomainError::RateLimited { retry_after_secs } if retry_after_secs == WINDOW_SECS as u64),
        "{err:?}"
    );
    assert_eq!(
        w.extractor.seen_plans.lock().unwrap().len(),
        PLANS_PER_WINDOW
    );
    // Someone else in the household is not held up.
    w.services
        .cook_plan
        .plan(Uuid::new_v4(), &[a, b], None)
        .await
        .unwrap();
    w.clock.advance(Duration::seconds(WINDOW_SECS));
    w.services
        .cook_plan
        .plan(w.user, &[a, b], None)
        .await
        .unwrap();
}
