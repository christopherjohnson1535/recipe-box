//! Search, tag filter and sort on `GET /api/recipes` (FND-2..4). Uses the shared harness in `common/`.

mod common;

use axum::http::StatusCode;
use common::{TestApp, a_recipe};
use uuid::Uuid;

/// Search-test helpers on the shared app.
trait SearchExt {
    async fn list(&self, query: &str) -> (Vec<String>, i64);
    async fn search(&self, q: &str) -> Vec<String>;
    async fn add(
        &self,
        title: &str,
        ingredients: &[&str],
        minutes: Option<i32>,
        tags: &[&str],
    ) -> Uuid;
}

impl SearchExt for TestApp {
    /// GET /api/recipes with the given raw query string; returns (titles in order, total).
    async fn list(&self, query: &str) -> (Vec<String>, i64) {
        let res = self
            .get(&format!("/api/recipes?{query}"), &self.cookie)
            .await;
        assert_eq!(res.status, StatusCode::OK, "{query}: {}", res.json);
        let titles = res.json["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["title"].as_str().unwrap().to_string())
            .collect();
        (titles, res.json["total"].as_i64().unwrap())
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
        let mut recipe = a_recipe()
            .titled(title)
            .with_ingredients(ingredients)
            .with_tags(tags);
        if let Some(m) = minutes {
            recipe = recipe.minutes(m);
        }
        self.insert_recipe(recipe).await
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

async fn seed(ctx: &TestApp) {
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
    let ctx = TestApp::spawn_as_admin().await;
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
}

#[tokio::test]
async fn websearch_syntax() {
    let ctx = TestApp::spawn_as_admin().await;
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
}

#[tokio::test]
async fn tag_and_query_combine() {
    let ctx = TestApp::spawn_as_admin().await;
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
}

#[tokio::test]
async fn tag_names_are_searched() {
    let ctx = TestApp::spawn_as_admin().await;
    seed(&ctx).await;
    let mut hits = ctx.search("dinner").await;
    hits.sort();
    assert_eq!(
        hits,
        ["Tomato soup", "Weeknight lasagne"],
        "tag name, not in text"
    );
    let mut hits = ctx.search("DIN").await;
    hits.sort();
    assert_eq!(
        hits,
        ["Tomato soup", "Weeknight lasagne"],
        "tag prefix, any case"
    );
    assert_eq!(
        ctx.list("q=dinner&tag=pasta").await,
        (vec!["Weeknight lasagne".to_string()], 1)
    );
    assert_eq!(ctx.list("q=dinner&tag=dessert").await, (vec![], 0));
    assert_eq!(ctx.list("q=dinner").await.1, 2, "total counts tag hits");
}

#[tokio::test]
async fn sorts_and_total() {
    let ctx = TestApp::spawn_as_admin().await;
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
    assert_eq!(
        ctx.get("/api/recipes?sort=bogus", &ctx.cookie).await.status,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn relevance_prefers_title_hits() {
    let ctx = TestApp::spawn_as_admin().await;
    ctx.add("Toast", &["bread", "butter"], None, &[]).await;
    ctx.add("Butter chicken", &["chicken"], None, &[]).await;
    assert_eq!(ctx.search("butter").await, ["Butter chicken", "Toast"]);
}

#[tokio::test]
async fn soft_deleted_are_excluded() {
    let ctx = TestApp::spawn_as_admin().await;
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
}

#[tokio::test]
async fn special_characters_are_literal_and_safe() {
    let ctx = TestApp::spawn_as_admin().await;
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
        "a\u{0}b",
        "\u{0}",
    ] {
        ctx.list(&format!("q={}", enc(q))).await; // must answer 200, not error
    }
    assert_eq!(ctx.list("tag=a%00b").await.1, 0, "NUL in tag is not a 500");
    assert_eq!(ctx.list("").await.1, 8, "nothing was dropped");
}

#[tokio::test]
async fn two_thousand_recipes_search_returns_the_right_counts() {
    let ctx = TestApp::spawn_as_admin().await;
    // Realistic rows: ~10 ingredients of 30-60 chars, a 300-char description, 3 tags.
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
    .execute(&ctx.pool)
    .await
    .unwrap();
    sqlx::query("insert into tags (name) values ('dinner'), ('weeknight'), ('family')")
        .execute(&ctx.pool)
        .await
        .unwrap();
    sqlx::query("insert into recipe_tags select r.id, t.id from recipes r, tags t where t.name <> 'dinner' or r.title like '%lasagne'")
        .execute(&ctx.pool)
        .await
        .unwrap();
    sqlx::query("analyze recipes")
        .execute(&ctx.pool)
        .await
        .unwrap();

    // Counts, not timings: the generated data has 400 buttermilk rows (n % 5 = 0) and 285 lasagne rows (n % 7 = 0).
    // Speed is a benchmark question, and a wall-clock assertion here fails on a busy machine.
    assert_eq!(ctx.list("q=buttermilk").await.1, 400);
    assert_eq!(ctx.list("q=lasag").await.1, 285);
    // (query, total with no tag filter, total with tag=dinner). `dinner` is a tag name (on lasagne rows only); "recipe 12 stew" is exactly n = 12;
    // "weeknight lasag" matches nothing because `weeknight` is only a tag and `lasag` only in titles (terms are
    // not combined across fields).
    for (q, any_tag, dinner_only) in [
        ("weeknight lasag", 0, 0),
        ("recipe 12 stew", 1, 0),
        ("dinner", 285, 285),
    ] {
        for (query, want) in [
            (format!("q={}&tag=dinner", enc(q)), dinner_only),
            (format!("q={}", enc(q)), any_tag),
        ] {
            let (items, total) = ctx.list(&query).await;
            assert_eq!(total, want, "{query}");
            assert!(items.len() as i64 <= total, "{query}");
        }
    }
}
