//! FND-2 benchmark: search over 2,000 recipes must answer in under 300 ms (median). Run with `just bench`.
//! Not part of the correctness suite: a wall-clock check belongs here, never in `tests/`.
//! Needs Postgres (`TEST_DATABASE_URL`); works in its own throwaway schema and drops it at the end.

use std::{
    str::FromStr,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use chrono::{TimeZone, Utc};
use http_body_util::BodyExt;
use recipe_box_api::{clock::Clock, config::Config, state::AppState};
use serde_json::json;
use sqlx::{
    Executor,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use tower::ServiceExt;
use uuid::Uuid;

const BUDGET: Duration = Duration::from_millis(300);
const RUNS: usize = 50;
const QUERIES: [&str; 4] = [
    "q=buttermilk",
    "q=lasag",
    "q=recipe%2012%20stew",
    "q=lasag&tag=dinner&sort=title",
];

/// Removes the temp media dir on drop, including while unwinding from a panic.
struct RemoveDir(std::path::PathBuf);

impl Drop for RemoveDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tokio::main]
async fn main() {
    let url = std::env::var("TEST_DATABASE_URL")
        .expect("set TEST_DATABASE_URL (see `just db`) to run the search benchmark");
    let schema = format!("bench_{}", Uuid::new_v4().simple());
    let media_dir = std::env::temp_dir().join(&schema);

    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    admin
        .execute("create extension if not exists citext with schema public")
        .await
        .unwrap();
    admin
        .execute(sqlx::AssertSqlSafe(format!("create schema {schema}")))
        .await
        .unwrap();

    // Clean up even if `run` panics: the schema is dropped below, the temp dir by the guard.
    let cleanup = RemoveDir(media_dir.clone());
    let outcome = tokio::spawn({
        let (url, schema, media_dir) = (url.clone(), schema.clone(), media_dir.clone());
        async move { run(&url, &schema, &media_dir).await }
    })
    .await;
    admin
        .execute(sqlx::AssertSqlSafe(format!("drop schema {schema} cascade")))
        .await
        .unwrap();
    drop(cleanup); // process::exit below skips destructors
    let slowest = outcome.unwrap_or_else(|e| std::panic::resume_unwind(e.into_panic()));
    if slowest > BUDGET {
        eprintln!("FAIL: a median exceeded the FND-2 budget of {BUDGET:?}");
        std::process::exit(1);
    }
}

/// Seeds the schema, times every query and returns the largest median.
async fn run(url: &str, schema: &str, media_dir: &std::path::Path) -> Duration {
    let opts = PgConnectOptions::from_str(url)
        .unwrap()
        .options([("search_path", format!("{schema},public"))]);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .unwrap();
    adapter_postgres::migrate(&pool).await.unwrap();
    std::fs::create_dir_all(media_dir).unwrap();

    let config = Config {
        database_url: url.into(),
        media_dir: media_dir.into(),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "none".into(),
        anthropic_api_key: None,
        ai_model: "bench".into(),
        max_upload_mb: 2,
    };
    let clock = Clock::fixed(Utc.with_ymd_and_hms(2026, 1, 15, 12, 0, 0).unwrap());
    let state = AppState::with_clock(pool.clone(), config, clock).unwrap();
    let router = recipe_box_api::router(state);

    // Same realistic rows as the correctness test in tests/search.rs.
    sqlx::query(
        "insert into recipes (title, description, notes, ingredients, total_minutes)
         select 'Recipe ' || n || case when n % 7 = 0 then ' lasagne' else ' stew' end,
                left(repeat('Family favourite number ' || n || ' with a long note about the dish. ', 8), 300),
                repeat('Rest before serving and keep the leftovers covered. ', 6),
                (select jsonb_agg(jsonb_build_object('text',
                     (1 + k) * 25 || ' g ' || (array['plain flour','caster sugar','unsalted butter','whole milk','chopped onion',
                       'crushed garlic','tinned tomatoes','grated parmesan','olive oil','fresh basil leaves'])[k + 1]
                       || ' sifted and ' || case when n % 5 = 0 and k = 3 then 'buttermilk' else 'divided' end))
                 from generate_series(0, 9) k),
                n % 120
         from generate_series(1, 2000) n",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("insert into tags (name) values ('dinner'), ('weeknight'), ('family')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("insert into recipe_tags select r.id, t.id from recipes r, tags t where t.name <> 'dinner' or r.title like '%lasagne'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("analyze recipes").execute(&pool).await.unwrap();

    let setup = Request::post("/api/setup")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({ "username": "admin", "displayName": "Admin", "password": "correct horse battery" }).to_string(),
        ))
        .unwrap();
    let res = router.clone().oneshot(setup).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let cookie = res.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string();

    println!(
        "FND-2: search over 2,000 recipes, {RUNS} requests per query, budget {BUDGET:?} (median)"
    );
    let mut slowest = Duration::ZERO;
    for q in QUERIES {
        let mut times = Vec::with_capacity(RUNS);
        for _ in 0..RUNS {
            let req = Request::get(format!("/api/recipes?{q}"))
                .header(header::COOKIE, &cookie)
                .body(Body::empty())
                .unwrap();
            let start = Instant::now();
            let res = router.clone().oneshot(req).await.unwrap();
            let status = res.status();
            res.into_body().collect().await.unwrap();
            times.push(start.elapsed());
            assert_eq!(status, StatusCode::OK, "{q}");
        }
        times.sort();
        let median = times[RUNS / 2];
        slowest = slowest.max(median);
        let verdict = if median < BUDGET { "ok" } else { "OVER BUDGET" };
        println!(
            "{q:<34} min {:>8.2?}  median {:>8.2?}  p95 {:>8.2?}  {verdict}",
            times[0],
            median,
            times[RUNS * 95 / 100]
        );
    }
    pool.close().await;
    slowest
}
