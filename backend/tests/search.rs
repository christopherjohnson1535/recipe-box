//! Search, tag filter and sort on `GET /api/recipes` (FND-2..4). Needs `TEST_DATABASE_URL`, like `api.rs`.

use std::{str::FromStr, time::Instant};

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use recipe_box_api::{config::Config, state::AppState};
use serde_json::{Value, json};
use sqlx::{
    Executor, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use tower::ServiceExt;
use uuid::Uuid;

struct Ctx {
    app: Router,
    pool: PgPool,
    admin_pool: PgPool,
    schema: String,
    cookie: String,
}

async fn ctx() -> Option<Ctx> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("note: TEST_DATABASE_URL not set, skipping integration test");
        return None;
    };
    let admin_pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let mut tx = admin_pool.begin().await.unwrap();
    tx.execute("select pg_advisory_xact_lock(727274)")
        .await
        .unwrap();
    tx.execute("create extension if not exists citext with schema public")
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let schema = format!("test_{}", Uuid::new_v4().simple());
    admin_pool
        .execute(sqlx::AssertSqlSafe(format!("create schema {schema}")))
        .await
        .unwrap();
    let opts = PgConnectOptions::from_str(&url)
        .unwrap()
        .options([("search_path", format!("{schema},public"))]);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await
        .unwrap();
    recipe_box_api::migrate(&pool).await.unwrap();
    let config = Config {
        database_url: url,
        media_dir: std::env::temp_dir().join(&schema),
        bind_addr: "127.0.0.1:0".into(),
        cookie_secure: false,
        session_days: 30,
        ai_provider: "none".into(),
        anthropic_api_key: None,
        ai_model: "test".into(),
        max_upload_mb: 2,
    };
    let app = recipe_box_api::router(AppState::new(pool.clone(), config).unwrap());
    let mut ctx = Ctx {
        app,
        pool,
        admin_pool,
        schema,
        cookie: String::new(),
    };
    let res = ctx
        .request(
            Request::post("/api/setup")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({ "username": "admin", "displayName": "Admin", "password": "correct horse battery" })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(res.0, StatusCode::CREATED);
    ctx.cookie = res.1.unwrap().split(';').next().unwrap().to_string();
    Some(ctx)
}

impl Ctx {
    async fn request(&self, req: Request<Body>) -> (StatusCode, Option<String>, Value) {
        let res = self.app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let cookie = res
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().to_string());
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            cookie,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    /// GET /api/recipes with the given raw query string; returns (titles in order, total).
    async fn list(&self, query: &str) -> (Vec<String>, i64) {
        let req = Request::builder()
            .method(Method::GET)
            .uri(format!("/api/recipes?{query}"))
            .header(header::COOKIE, &self.cookie)
            .body(Body::empty())
            .unwrap();
        let (status, _, json) = self.request(req).await;
        assert_eq!(status, StatusCode::OK, "{query}: {json}");
        let titles = json["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["title"].as_str().unwrap().to_string())
            .collect();
        (titles, json["total"].as_i64().unwrap())
    }

    async fn search(&self, q: &str) -> Vec<String> {
        self.list(&format!("q={}", enc(q))).await.0
    }

    async fn add(
        &self,
        title: &str,
        ingredients: &[&str],
        minutes: Option<i32>,
        tags: &[&str],
    ) -> Uuid {
        let ings: Vec<Value> = ingredients.iter().map(|t| json!({ "text": t })).collect();
        let id: Uuid = sqlx::query_scalar(
            "insert into recipes (title, ingredients, total_minutes) values ($1, $2, $3) returning id",
        )
        .bind(title)
        .bind(Value::Array(ings))
        .bind(minutes)
        .fetch_one(&self.pool)
        .await
        .unwrap();
        for tag in tags {
            sqlx::query("insert into tags (name) values ($1) on conflict do nothing")
                .bind(tag)
                .execute(&self.pool)
                .await
                .unwrap();
            sqlx::query("insert into recipe_tags select $1, id from tags where name = $2")
                .bind(id)
                .bind(tag)
                .execute(&self.pool)
                .await
                .unwrap();
        }
        id
    }

    async fn cleanup(self) {
        self.pool.close().await;
        self.admin_pool
            .execute(sqlx::AssertSqlSafe(format!(
                "drop schema {} cascade",
                self.schema
            )))
            .await
            .unwrap();
    }
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

async fn seed(ctx: &Ctx) {
    ctx.add(
        "Weeknight lasagne",
        &["500g beef mince", "1 cup buttermilk"],
        Some(90),
        &["dinner", "pasta"],
    )
    .await;
    ctx.add(
        "Buttermilk pancakes",
        &["2 cups flour", "1 cup buttermilk"],
        Some(20),
        &["breakfast"],
    )
    .await;
    ctx.add("Tomato soup", &["6 tomatoes", "1 onion"], None, &["dinner"])
        .await;
    ctx.add("Apple crumble", &["apples", "oats"], Some(45), &["dessert"])
        .await;
}

#[tokio::test]
async fn ingredient_and_title_matches() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    let mut hits = ctx.search("buttermilk").await;
    hits.sort();
    assert_eq!(hits, ["Buttermilk pancakes", "Weeknight lasagne"]);
    assert_eq!(
        ctx.search("lasag").await,
        ["Weeknight lasagne"],
        "partial word inside a title"
    );
    assert_eq!(ctx.search("weeknight lasag").await, ["Weeknight lasagne"]);
    assert_eq!(
        ctx.search("Apple C").await,
        ["Apple crumble"],
        "title prefix across a space"
    );
    assert_eq!(
        ctx.search("  TOMATO ").await,
        ["Tomato soup"],
        "case and padding"
    );
    assert!(ctx.search("zzz").await.is_empty());
    // Empty or blank q is no filter.
    assert_eq!(ctx.list("q=%20%20").await.1, 4);
    ctx.cleanup().await;
}

#[tokio::test]
async fn websearch_syntax() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    assert_eq!(ctx.search("\"beef mince\"").await, ["Weeknight lasagne"]);
    assert!(
        ctx.search("\"mince beef\"").await.is_empty(),
        "phrase order matters"
    );
    assert_eq!(
        ctx.search("buttermilk -pancakes").await,
        ["Weeknight lasagne"]
    );
    let mut hits = ctx.search("tomato or apples").await;
    hits.sort();
    assert_eq!(hits, ["Apple crumble", "Tomato soup"]);
    ctx.cleanup().await;
}

#[tokio::test]
async fn tag_and_query_combine() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    assert_eq!(
        ctx.list("q=buttermilk&tag=dinner").await,
        (vec!["Weeknight lasagne".to_string()], 1)
    );
    assert_eq!(ctx.list("q=buttermilk&tag=dessert").await, (vec![], 0));
    assert_eq!(
        ctx.list("tag=dinner&sort=title").await.0,
        ["Tomato soup", "Weeknight lasagne"]
    );
    ctx.cleanup().await;
}

#[tokio::test]
async fn sorts_and_total() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    assert_eq!(
        ctx.list("sort=title").await.0,
        [
            "Apple crumble",
            "Buttermilk pancakes",
            "Tomato soup",
            "Weeknight lasagne"
        ]
    );
    assert_eq!(
        ctx.list("sort=time").await.0,
        [
            "Buttermilk pancakes",
            "Apple crumble",
            "Weeknight lasagne",
            "Tomato soup"
        ],
        "quickest first, no time last"
    );
    assert_eq!(ctx.list("sort=newest").await.0[0], "Apple crumble");
    assert_eq!(ctx.list("").await.0[0], "Apple crumble");
    // An explicit sort beats relevance; total ignores paging.
    assert_eq!(
        ctx.list("q=buttermilk&sort=time").await.0,
        ["Buttermilk pancakes", "Weeknight lasagne"]
    );
    assert_eq!(
        ctx.list("sort=title&limit=1&offset=1").await,
        (vec!["Buttermilk pancakes".to_string()], 4)
    );
    let req = Request::get("/api/recipes?sort=bogus")
        .header(header::COOKIE, &ctx.cookie)
        .body(Body::empty())
        .unwrap();
    assert_eq!(ctx.request(req).await.0, StatusCode::BAD_REQUEST);
    ctx.cleanup().await;
}

#[tokio::test]
async fn relevance_prefers_title_hits() {
    let Some(ctx) = ctx().await else { return };
    ctx.add("Toast", &["bread", "butter"], None, &[]).await;
    ctx.add("Butter chicken", &["chicken"], None, &[]).await;
    assert_eq!(ctx.search("butter").await, ["Butter chicken", "Toast"]);
    ctx.cleanup().await;
}

#[tokio::test]
async fn soft_deleted_are_excluded() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    let id = ctx
        .add("Buttermilk waffles", &["buttermilk"], None, &["breakfast"])
        .await;
    assert_eq!(ctx.search("waffles").await.len(), 1);
    sqlx::query("update recipes set deleted_at = now() where id = $1")
        .bind(id)
        .execute(&ctx.pool)
        .await
        .unwrap();
    assert!(ctx.search("waffles").await.is_empty());
    assert_eq!(ctx.list("q=buttermilk&tag=breakfast").await.1, 1);
    ctx.cleanup().await;
}

#[tokio::test]
async fn special_characters_are_literal_and_safe() {
    let Some(ctx) = ctx().await else { return };
    seed(&ctx).await;
    ctx.add("100% juice", &["oranges"], None, &[]).await;
    ctx.add("Mom's pie", &["apples"], None, &[]).await;
    ctx.add("a_b stew", &["beans"], None, &[]).await;
    ctx.add("axb stew", &["beans"], None, &[]).await;
    assert_eq!(ctx.search("100%").await, ["100% juice"]);
    assert!(
        ctx.search("%").await.len() <= 1,
        "% must not match everything"
    );
    assert_eq!(ctx.search("a_b").await, ["a_b stew"], "_ is not a wildcard");
    assert_eq!(ctx.search("Mom's").await, ["Mom's pie"]);
    for q in [
        "'",
        "\\",
        "\"",
        "-",
        "(",
        ")",
        ":*",
        "&|!",
        "a\\",
        "'; drop table recipes; --",
        "é",
        "<->",
    ] {
        ctx.list(&format!("q={}", enc(q))).await; // must answer 200, not error
    }
    assert_eq!(ctx.list("").await.1, 8, "nothing was dropped");
    ctx.cleanup().await;
}

#[tokio::test]
async fn two_thousand_recipes_search_fast() {
    let Some(ctx) = ctx().await else { return };
    sqlx::query(
        "insert into recipes (title, description, ingredients, total_minutes)
         select 'Recipe ' || n || case when n % 7 = 0 then ' lasagne' else ' stew' end,
                'Family favourite number ' || n,
                jsonb_build_array(jsonb_build_object('text', n || ' g flour'),
                                  jsonb_build_object('text', case when n % 5 = 0 then 'buttermilk' else 'water' end)),
                n % 120
         from generate_series(1, 2000) n",
    )
    .execute(&ctx.pool)
    .await
    .unwrap();
    sqlx::query("insert into tags (name) values ('dinner')")
        .execute(&ctx.pool)
        .await
        .unwrap();
    sqlx::query("insert into recipe_tags select r.id, t.id from recipes r, tags t where r.title like '%lasagne'")
        .execute(&ctx.pool)
        .await
        .unwrap();
    sqlx::query("analyze").execute(&ctx.pool).await.unwrap();

    ctx.search("buttermilk").await; // warm-up
    for q in ["buttermilk", "lasag", "weeknight lasag", "recipe 12 stew"] {
        let started = Instant::now();
        let (items, total) = ctx.list(&format!("q={}&tag=dinner", enc(q))).await;
        let ms = started.elapsed().as_millis();
        eprintln!(
            "search {q:?} + tag over 2000 recipes: {ms} ms ({total} hits, {} returned)",
            items.len()
        );
        assert!(ms < 300, "{q}: {ms} ms");
        let started = Instant::now();
        let (_, total) = ctx.list(&format!("q={}", enc(q))).await;
        let ms = started.elapsed().as_millis();
        eprintln!("search {q:?} over 2000 recipes: {ms} ms ({total} hits)");
        assert!(ms < 300, "{q}: {ms} ms");
    }
    ctx.cleanup().await;
}
