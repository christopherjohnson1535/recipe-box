//! Grocery list routes (GRO) against a real Postgres through the shared harness in `common/`. The rules themselves
//! (merging, ticks, sections) are tested in `crates/app/tests/grocery.rs`; this file checks the HTTP shape.

mod common;

use axum::http::{Method, StatusCode};
use common::{MEMBER_PASSWORD, TestApp, a_recipe, a_user, session_pair};
use serde_json::{Value, json};
use uuid::Uuid;

async fn patch(ctx: &TestApp, path: &str, cookie: &str, body: Value) -> common::Res {
    ctx.call(Method::PATCH, path, Some(cookie), Some(body))
        .await
}

fn item<'a>(list: &'a Value, name: &str) -> &'a Value {
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["name"] == name)
        .unwrap_or_else(|| panic!("no item {name} in {list}"))
}

fn names(list: &Value) -> Vec<&str> {
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["name"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn every_route_needs_a_session() {
    let ctx = TestApp::spawn_as_admin().await;
    let id = Uuid::new_v4();
    for (method, path, body) in [
        (Method::GET, "/api/grocery".to_string(), None),
        (Method::DELETE, "/api/grocery".into(), None),
        (
            Method::POST,
            "/api/grocery/recipes".into(),
            Some(json!({ "recipeId": id })),
        ),
        (Method::DELETE, format!("/api/grocery/recipes/{id}"), None),
        (
            Method::POST,
            "/api/grocery/items".into(),
            Some(json!({ "text": "tea" })),
        ),
        (
            Method::PATCH,
            format!("/api/grocery/items/{id}"),
            Some(json!({ "checked": true })),
        ),
        (Method::DELETE, format!("/api/grocery/items/{id}"), None),
        (Method::POST, "/api/grocery/clear-checked".into(), None),
    ] {
        let res = ctx.call(method.clone(), &path, None, body).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated"),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn the_list_is_made_on_first_use_and_shared_by_members() {
    let ctx = TestApp::spawn_as_admin().await;
    let admin = ctx.cookie.as_str();
    ctx.create_user(admin, a_user().named("mem")).await;
    let mem = session_pair(&ctx.login("mem", MEMBER_PASSWORD).await);

    let list = ctx.get("/api/grocery", &mem).await;
    list.assert_status(StatusCode::OK);
    assert_eq!(list.json["recipes"], json!([]));
    assert_eq!(list.json["items"], json!([]));
    assert!(list.json["id"].is_string() && list.json["updatedAt"].is_string());

    // What a member adds, the admin sees.
    ctx.post("/api/grocery/items", &mem, json!({ "text": "tea" }))
        .await
        .assert_status(StatusCode::CREATED);
    let seen = ctx.get("/api/grocery", admin).await;
    assert_eq!(names(&seen.json), ["tea"]);
    assert_eq!(seen.json["id"], list.json["id"], "one list");
}

#[tokio::test]
async fn recipes_on_the_list() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let soup = ctx
        .post(
            "/api/recipes",
            c,
            json!({
                "title": "Soup", "servings": "4-6",
                "ingredients": [{ "text": "2 onions" }, { "text": "1 1/2 cups stock" }, { "text": "salt to taste" }],
            }),
        )
        .await;
    soup.assert_status(StatusCode::CREATED);
    let soup = soup.json["id"].as_str().unwrap().to_string();
    let stew = ctx
        .create_recipe_id(
            c,
            a_recipe()
                .titled("Stew")
                .with_ingredients(&["1 onion", "1 lb beef"]),
        )
        .await;

    let list = ctx
        .post("/api/grocery/recipes", c, json!({ "recipeId": soup }))
        .await;
    list.assert_status(StatusCode::OK);
    assert_eq!(
        list.json["recipes"],
        json!([{ "recipeId": soup, "title": "Soup", "scale": 1.0, "servings": "4–6", "imageUrl": null }])
    );
    // Items are in shopping order and carry the amounts as a cook writes them.
    assert_eq!(names(&list.json), ["onions", "salt to taste", "stock"]);
    assert_eq!(
        item(&list.json, "onions"),
        &json!({
            "id": item(&list.json, "onions")["id"], "name": "onions", "section": "produce",
            "amounts": [{ "quantity": "2", "unit": null }], "checked": false, "manual": false,
            "staple": false, "recipeIds": [soup],
        })
    );
    assert_eq!(
        item(&list.json, "stock")["amounts"],
        json!([{ "quantity": "1½", "unit": "cup" }])
    );
    assert_eq!(item(&list.json, "salt to taste")["amounts"], json!([]));

    ctx.clock.advance(chrono::Duration::seconds(1)); // recipes are listed in the order they were added
    // A second recipe merges onions; a rescale changes the amounts and the servings.
    let list = ctx
        .post("/api/grocery/recipes", c, json!({ "recipeId": stew }))
        .await;
    assert_eq!(
        item(&list.json, "onions")["amounts"],
        json!([{ "quantity": "3", "unit": null }])
    );
    let list = ctx
        .post(
            "/api/grocery/recipes",
            c,
            json!({ "recipeId": soup, "scale": 0.5 }),
        )
        .await;
    list.assert_status(StatusCode::OK);
    assert_eq!(list.json["recipes"].as_array().unwrap().len(), 2);
    assert_eq!(list.json["recipes"][0]["scale"], 0.5);
    assert_eq!(list.json["recipes"][0]["servings"], "2–3");
    assert_eq!(
        item(&list.json, "onions")["amounts"],
        json!([{ "quantity": "2", "unit": null }])
    );

    // Taking a recipe off drops its items; it is a 404 the second time.
    let list = ctx.delete(&format!("/api/grocery/recipes/{soup}"), c).await;
    list.assert_status(StatusCode::OK);
    assert_eq!(names(&list.json), ["onion", "beef"]);
    ctx.delete(&format!("/api/grocery/recipes/{soup}"), c)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
}

#[tokio::test]
async fn bad_requests_to_the_recipe_routes() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let id = ctx
        .create_recipe_id(c, a_recipe().with_ingredients(&["1 egg"]))
        .await;
    for scale in [json!(0.1), json!(11), json!(0), json!(-1), json!("2")] {
        ctx.post(
            "/api/grocery/recipes",
            c,
            json!({ "recipeId": id, "scale": scale }),
        )
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    for body in [
        json!({}),
        json!({ "recipeId": "nope" }),
        json!({ "recipeId": id, "extra": 1 }),
    ] {
        ctx.post("/api/grocery/recipes", c, body)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    ctx.post(
        "/api/grocery/recipes",
        c,
        json!({ "recipeId": Uuid::new_v4() }),
    )
    .await
    .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.delete("/api/grocery/recipes/not-an-id", c)
        .await
        .assert_error(StatusCode::BAD_REQUEST, "validation");
    ctx.delete(&format!("/api/grocery/recipes/{}", Uuid::new_v4()), c)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
}

#[tokio::test]
async fn a_deleted_recipe_disappears_from_the_list() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let a = ctx
        .create_recipe_id(c, a_recipe().titled("A").with_ingredients(&["2 onions"]))
        .await;
    let b = ctx
        .create_recipe_id(c, a_recipe().titled("B").with_ingredients(&["1 cup flour"]))
        .await;
    ctx.post("/api/grocery/recipes", c, json!({ "recipeId": a }))
        .await;
    ctx.post("/api/grocery/recipes", c, json!({ "recipeId": b }))
        .await;

    ctx.delete(&format!("/api/recipes/{a}"), c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    let list = ctx.get("/api/grocery", c).await;
    assert_eq!(names(&list.json), ["flour"]);
    assert_eq!(list.json["recipes"].as_array().unwrap().len(), 1);
    ctx.post("/api/grocery/recipes", c, json!({ "recipeId": a }))
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");

    // Undo within the window: back, at its scale.
    ctx.post(&format!("/api/recipes/{a}/restore"), c, Value::Null)
        .await
        .assert_status(StatusCode::OK);
    let list = ctx.get("/api/grocery", c).await;
    assert_eq!(names(&list.json), ["onions", "flour"]);
}

#[tokio::test]
async fn manual_items_ticking_moving_and_clearing() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();

    let tea = ctx
        .post(
            "/api/grocery/items",
            c,
            json!({ "text": "  2 lb potatoes " }),
        )
        .await;
    tea.assert_status(StatusCode::CREATED);
    assert_eq!(tea.json["name"], "potatoes");
    assert_eq!(
        tea.json["amounts"],
        json!([{ "quantity": "2", "unit": "lb" }])
    );
    assert_eq!(
        (
            &tea.json["manual"],
            &tea.json["section"],
            &tea.json["checked"]
        ),
        (&json!(true), &json!("produce"), &json!(false))
    );
    assert_eq!(tea.json["recipeIds"], json!([]));
    let potatoes = tea.json["id"].as_str().unwrap().to_string();
    let given = ctx
        .post(
            "/api/grocery/items",
            c,
            json!({ "text": "mystery", "section": "freezer" }),
        )
        .await;
    given.assert_status(StatusCode::CREATED);
    assert_eq!(given.json["section"], "freezer");

    // Tick it, move it, mark it a staple.
    let before = ctx.get("/api/grocery", c).await.json["updatedAt"].clone();
    ctx.clock.advance(chrono::Duration::seconds(1));
    let res = patch(
        &ctx,
        &format!("/api/grocery/items/{potatoes}"),
        c,
        json!({ "checked": true }),
    )
    .await;
    res.assert_status(StatusCode::OK);
    assert_eq!(res.json["checked"], true);
    assert_ne!(
        ctx.get("/api/grocery", c).await.json["updatedAt"],
        before,
        "every write moves updatedAt"
    );
    let res = patch(
        &ctx,
        &format!("/api/grocery/items/{potatoes}"),
        c,
        json!({ "section": "pantry", "staple": true }),
    )
    .await;
    assert_eq!(
        (
            &res.json["section"],
            &res.json["staple"],
            &res.json["checked"]
        ),
        (&json!("pantry"), &json!(true), &json!(true))
    );

    // The ticked item is cleared; the other stays.
    let list = ctx.post("/api/grocery/clear-checked", c, Value::Null).await;
    list.assert_status(StatusCode::OK);
    assert_eq!(names(&list.json), ["mystery"]);
    let mystery = list.json["items"][0]["id"].as_str().unwrap().to_string();
    ctx.delete(&format!("/api/grocery/items/{mystery}"), c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    ctx.delete(&format!("/api/grocery/items/{mystery}"), c)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    assert_eq!(
        names(&ctx.get("/api/grocery", c).await.json),
        Vec::<&str>::new()
    );
}

#[tokio::test]
async fn a_moved_item_is_filed_there_on_the_next_list() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let id = ctx
        .create_recipe_id(c, a_recipe().with_ingredients(&["1 avocado", "1 tsp salt"]))
        .await;
    let list = ctx
        .post("/api/grocery/recipes", c, json!({ "recipeId": id }))
        .await;
    assert_eq!(item(&list.json, "avocado")["section"], "produce");
    assert_eq!(
        item(&list.json, "salt")["staple"],
        true,
        "salt starts as a staple"
    );
    let avocado = item(&list.json, "avocado")["id"]
        .as_str()
        .unwrap()
        .to_string();
    patch(
        &ctx,
        &format!("/api/grocery/items/{avocado}"),
        c,
        json!({ "section": "pantry" }),
    )
    .await
    .assert_status(StatusCode::OK);

    ctx.delete("/api/grocery", c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    let empty = ctx.get("/api/grocery", c).await;
    assert_eq!(
        (&empty.json["recipes"], &empty.json["items"]),
        (&json!([]), &json!([]))
    );
    let list = ctx
        .post("/api/grocery/recipes", c, json!({ "recipeId": id }))
        .await;
    assert_eq!(item(&list.json, "avocado")["section"], "pantry");
}

#[tokio::test]
async fn bad_requests_to_the_item_routes() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    for text in [json!(""), json!("   "), json!("x".repeat(201)), json!(5)] {
        ctx.post("/api/grocery/items", c, json!({ "text": text }))
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    ctx.post("/api/grocery/items", c, json!({ "text": "x".repeat(200) }))
        .await
        .assert_status(StatusCode::CREATED);
    for body in [json!({}), json!({ "text": "tea", "section": "aisle 5" })] {
        ctx.post("/api/grocery/items", c, body)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }

    let id = ctx
        .post("/api/grocery/items", c, json!({ "text": "tea" }))
        .await
        .json["id"]
        .as_str()
        .unwrap()
        .to_string();
    let path = format!("/api/grocery/items/{id}");
    for body in [
        json!({}),
        json!({ "section": "aisle 5" }),
        json!({ "checked": "yes" }),
        json!({ "other": 1 }),
    ] {
        patch(&ctx, &path, c, body)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
    let missing = format!("/api/grocery/items/{}", Uuid::new_v4());
    patch(&ctx, &missing, c, json!({ "checked": true }))
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    ctx.delete(&missing, c)
        .await
        .assert_error(StatusCode::NOT_FOUND, "not_found");
    patch(
        &ctx,
        "/api/grocery/items/nope",
        c,
        json!({ "checked": true }),
    )
    .await
    .assert_error(StatusCode::BAD_REQUEST, "validation");
}

/// Two people adding recipes at the same moment both end up on the list, with all their items.
#[tokio::test]
async fn concurrent_adds_keep_every_recipe() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();
    let mut ids = Vec::new();
    for (title, line) in [
        ("A", "1 apple"),
        ("B", "1 pear"),
        ("C", "1 plum"),
        ("D", "1 fig"),
    ] {
        ids.push(
            ctx.create_recipe_id(c, a_recipe().titled(title).with_ingredients(&[line]))
                .await,
        );
    }
    let adds = ids
        .iter()
        .map(|id| ctx.post("/api/grocery/recipes", c, json!({ "recipeId": id })));
    for res in futures_util::future::join_all(adds).await {
        res.assert_status(StatusCode::OK);
    }
    let list = ctx.get("/api/grocery", c).await;
    assert_eq!(list.json["recipes"].as_array().unwrap().len(), 4);
    assert_eq!(names(&list.json), ["apple", "fig", "pear", "plum"]);
}

#[tokio::test]
async fn the_spec_lists_the_grocery_routes() {
    let spec: Value = serde_json::from_str(&recipe_box_api::routes::openapi::json()).unwrap();
    for (path, methods) in [
        ("/api/grocery", vec!["get", "delete"]),
        ("/api/grocery/recipes", vec!["post"]),
        ("/api/grocery/recipes/{recipeId}", vec!["delete"]),
        ("/api/grocery/items", vec!["post"]),
        ("/api/grocery/items/{id}", vec!["patch", "delete"]),
        ("/api/grocery/clear-checked", vec!["post"]),
    ] {
        for m in methods {
            assert!(spec["paths"][path][m].is_object(), "{m} {path}");
        }
    }
    for schema in [
        "GroceryList",
        "GroceryRecipe",
        "GroceryItem",
        "GroceryAmount",
        "GrocerySection",
    ] {
        assert!(
            spec["components"]["schemas"][schema].is_object(),
            "{schema}"
        );
    }
}
