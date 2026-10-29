//! Favourite routes (REC-5) against a real Postgres. Storage rules are in the contract suite and the service rules
//! in `crates/app/tests/services.rs`; this file checks the HTTP shape, the list filter and the wiring.

mod common;

use axum::http::{Method, StatusCode};
use common::{MEMBER_PASSWORD, TestApp, a_recipe, a_user, session_pair};
use uuid::Uuid;

fn star(recipe: &str) -> String {
    format!("/api/recipes/{recipe}/favourite")
}

/// `(title, isFavourite)` of a list response.
fn rows(res: &common::Res) -> Vec<(String, bool)> {
    res.json["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["title"].as_str().unwrap().to_string(),
                r["isFavourite"].as_bool().unwrap(),
            )
        })
        .collect()
}

#[tokio::test]
async fn starring_needs_a_session() {
    let ctx = TestApp::spawn_as_admin().await;
    let r = Uuid::new_v4().to_string();
    for method in [Method::PUT, Method::DELETE] {
        let res = ctx.call(method.clone(), &star(&r), None, None).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated"),
            "{method}"
        );
    }
}

#[tokio::test]
async fn each_member_stars_for_themselves_and_filters_with_search() {
    let ctx = TestApp::spawn_as_admin().await;
    let admin = ctx.cookie.as_str();
    ctx.create_user(admin, a_user().named("sam")).await;
    let sam = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    let soup = ctx
        .create_recipe_id(
            admin,
            a_recipe().titled("Lentil soup").with_tags(&["dinner"]),
        )
        .await;
    let stew = ctx
        .create_recipe_id(
            admin,
            a_recipe().titled("Lentil stew").with_tags(&["dinner"]),
        )
        .await;
    let cake = ctx.create_recipe_id(admin, a_recipe().titled("Cake")).await;

    for (who, id) in [(&sam, &soup), (&sam, &cake), (&sam, &cake)] {
        ctx.call(Method::PUT, &star(id), Some(who), None)
            .await
            .assert_status(StatusCode::NO_CONTENT);
    }
    ctx.call(Method::PUT, &star(&stew), Some(admin), None)
        .await
        .assert_status(StatusCode::NO_CONTENT);

    let mine = ctx
        .get("/api/recipes?favourite=true&sort=title", &sam)
        .await;
    mine.assert_status(StatusCode::OK);
    assert_eq!(
        rows(&mine),
        [("Cake".to_string(), true), ("Lentil soup".into(), true)]
    );
    assert_eq!(mine.json["total"], 2);
    let searched = ctx
        .get("/api/recipes?favourite=true&q=lentil&tag=dinner", &sam)
        .await;
    assert_eq!(rows(&searched), [("Lentil soup".to_string(), true)]);
    // The admin's list marks only the admin's own star.
    let all = ctx.get("/api/recipes?sort=title", admin).await;
    assert_eq!(
        rows(&all),
        [
            ("Cake".to_string(), false),
            ("Lentil soup".into(), false),
            ("Lentil stew".into(), true)
        ]
    );
    assert_eq!(
        ctx.get(&format!("/api/recipes/{soup}"), &sam).await.json["isFavourite"],
        true
    );
    assert_eq!(
        ctx.get(&format!("/api/recipes/{soup}"), admin).await.json["isFavourite"],
        false
    );
    ctx.get("/api/recipes?favourite=yes", &sam)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");

    for _ in 0..2 {
        ctx.call(Method::DELETE, &star(&cake), Some(&sam), None)
            .await
            .assert_status(StatusCode::NO_CONTENT);
    }
    let after = ctx.get("/api/recipes?favourite=true", &sam).await;
    assert_eq!(rows(&after), [("Lentil soup".to_string(), true)]);
}

#[tokio::test]
async fn a_star_hides_with_its_recipe_and_goes_with_its_member() {
    let ctx = TestApp::spawn_as_admin().await;
    let admin = ctx.cookie.as_str();
    let member = ctx.create_user(admin, a_user().named("sam")).await;
    let sam = session_pair(&ctx.login("sam", MEMBER_PASSWORD).await);
    let soup = ctx.create_recipe_id(admin, a_recipe().titled("Soup")).await;
    ctx.call(Method::PUT, &star(&soup), Some(&sam), None)
        .await
        .assert_status(StatusCode::NO_CONTENT);

    ctx.delete(&format!("/api/recipes/{soup}"), admin)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    for method in [Method::PUT, Method::DELETE] {
        ctx.call(method, &star(&soup), Some(&sam), None)
            .await
            .assert_error(StatusCode::NOT_FOUND, "not_found");
    }
    assert_eq!(
        ctx.get("/api/recipes?favourite=true", &sam).await.json["total"],
        0
    );
    let restored = ctx
        .call(
            Method::POST,
            &format!("/api/recipes/{soup}/restore"),
            Some(&sam),
            None,
        )
        .await;
    restored.assert_status(StatusCode::OK);
    assert_eq!(restored.json["isFavourite"], true, "back with the recipe");

    ctx.call(
        Method::PUT,
        "/api/recipes/not-an-id/favourite",
        Some(&sam),
        None,
    )
    .await
    .assert_error(StatusCode::BAD_REQUEST, "validation");
    let unknown = star(&Uuid::new_v4().to_string());
    ctx.call(Method::PUT, &unknown, Some(&sam), None)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");

    // Removing the member removes their stars; the recipe stays.
    ctx.delete(
        &format!("/api/users/{}", member["id"].as_str().unwrap()),
        admin,
    )
    .await
    .assert_status(StatusCode::NO_CONTENT);
    let left: i64 =
        sqlx::query_scalar("select count(*) from favourites where recipe_id = $1::uuid")
            .bind(&soup)
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(left, 0);
    ctx.get(&format!("/api/recipes/{soup}"), admin)
        .await
        .assert_status(StatusCode::OK);
}
