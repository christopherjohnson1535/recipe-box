//! Google Tasks export (GRO-5) over HTTP against a real Postgres and a local stub of Google (`common/google.rs`).
//! The rules (what is sent, what a dead token means) are also tested in `crates/app/tests/google.rs`; this file
//! checks the routes, the cookie, the redirects, the stored token and that no token ever reaches the browser.

mod common;

use axum::http::{Method, StatusCode};
use common::{
    MEMBER_PASSWORD, Res, TestApp, a_recipe, a_user, epoch,
    google::{CLIENT_ID, REDIRECT_URI, StubGoogle},
    session_pair,
};
use serde_json::{Value, json};
use url::Url;

const REFRESH: &str = "1//stub-refresh-token-1";

async fn app() -> (TestApp, StubGoogle) {
    let stub = StubGoogle::start().await;
    let app = TestApp::spawn_as_admin_with(|s| stub.enable(s)).await;
    (app, stub)
}

/// `rb_session=..; rb_google_state=..` as a browser holds them mid-flow.
fn with_state(session: &str, state: &str) -> String {
    format!("{session}; rb_google_state={state}")
}

/// The value of the `rb_google_state` cookie a response set.
fn state_of(res: &Res) -> String {
    let c = res.cookie.as_deref().expect("a Set-Cookie header");
    c.strip_prefix("rb_google_state=")
        .unwrap_or_else(|| panic!("{c}"))
        .split(';')
        .next()
        .unwrap()
        .to_string()
}

/// Starts the flow for the member holding `session`: the `state` Google would hand back.
async fn start(ctx: &TestApp, session: &str) -> String {
    let res = ctx.get("/api/integrations/google/connect", session).await;
    res.assert_status(StatusCode::FOUND);
    state_of(&res)
}

/// A full, successful connection for `session` with a refresh token of `refresh`.
async fn connect(ctx: &TestApp, stub: &StubGoogle, session: &str, code: &str, refresh: &str) {
    stub.accept_code(code, refresh);
    let state = start(ctx, session).await;
    let res = ctx
        .get(
            &format!("/api/integrations/google/callback?code={code}&state={state}"),
            &with_state(session, &state),
        )
        .await;
    assert_eq!(res.location.as_deref(), Some("/settings?google=connected"));
}

/// Puts a recipe with these ingredient lines on the household's grocery list.
async fn on_the_list(ctx: &TestApp, lines: &[&str]) {
    let c = ctx.cookie.as_str();
    let id = ctx
        .create_recipe_id(c, a_recipe().titled("Dinner").with_ingredients(lines))
        .await;
    ctx.post("/api/grocery/recipes", c, json!({ "recipeId": id }))
        .await
        .assert_status(StatusCode::OK);
}

async fn export(ctx: &TestApp, session: &str, body: Value) -> Res {
    ctx.post("/api/grocery/export/google-tasks", session, body)
        .await
}

async fn connections_stored(ctx: &TestApp) -> i64 {
    sqlx::query_scalar("select count(*) from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap()
}

fn titles(tree: &[(String, Vec<String>)]) -> Vec<(&str, Vec<&str>)> {
    tree.iter()
        .map(|(p, c)| (p.as_str(), c.iter().map(String::as_str).collect()))
        .collect()
}

#[tokio::test]
async fn every_route_needs_a_session() {
    let (ctx, _) = app().await;
    for (method, path, body) in [
        (Method::GET, "/api/integrations/google", None),
        (Method::GET, "/api/integrations/google/connect", None),
        (
            Method::GET,
            "/api/integrations/google/callback?code=c&state=s",
            None,
        ),
        (Method::DELETE, "/api/integrations/google", None),
        (
            Method::POST,
            "/api/grocery/export/google-tasks",
            Some(json!({})),
        ),
    ] {
        let res = ctx.call(method.clone(), path, None, body).await;
        assert_eq!(
            (res.status, res.code()),
            (StatusCode::UNAUTHORIZED, "unauthenticated"),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn without_google_configured_the_app_runs_and_only_the_tasks_feature_is_off() {
    let ctx = TestApp::spawn_as_admin().await;
    let c = ctx.cookie.as_str();

    let status = ctx.get("/api/integrations/google", c).await;
    status.assert_status(StatusCode::OK);
    assert_eq!(
        status.json,
        json!({ "configured": false, "connected": false, "connectedAt": null })
    );
    ctx.get("/api/integrations/google/connect", c)
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "google_disabled");
    export(&ctx, c, json!({}))
        .await
        .assert_error(StatusCode::UNPROCESSABLE_ENTITY, "google_disabled");
    let back = ctx
        .get("/api/integrations/google/callback?code=c&state=s", c)
        .await;
    assert_eq!(back.location.as_deref(), Some("/settings?google=error"));
    ctx.delete("/api/integrations/google", c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(connections_stored(&ctx).await, 0);

    // Everything else works, the grocery list included.
    on_the_list(&ctx, &["2 apples"]).await;
    let list = ctx.get("/api/grocery", c).await;
    list.assert_status(StatusCode::OK);
    assert_eq!(list.json["items"][0]["name"], "apples");
    ctx.get("/api/health", c)
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn status_follows_the_connection_and_is_per_member() {
    let (ctx, stub) = app().await;
    let admin = ctx.cookie.clone();
    let before = ctx.get("/api/integrations/google", &admin).await;
    assert_eq!(
        before.json,
        json!({ "configured": true, "connected": false, "connectedAt": null })
    );

    connect(&ctx, &stub, &admin, "code-1", REFRESH).await;
    let after = ctx.get("/api/integrations/google", &admin).await;
    assert_eq!(after.json["connected"], true);
    assert_eq!(
        after.json["connectedAt"]
            .as_str()
            .unwrap()
            .parse::<chrono::DateTime<chrono::Utc>>()
            .unwrap(),
        epoch()
    );

    ctx.create_user(&admin, a_user().named("mem")).await;
    let mem = session_pair(&ctx.login("mem", MEMBER_PASSWORD).await);
    let theirs = ctx.get("/api/integrations/google", &mem).await;
    assert_eq!(theirs.json["connected"], false);
    export(&ctx, &mem, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");
}

#[tokio::test]
async fn connect_redirects_to_google_with_a_state_that_is_also_in_a_cookie() {
    let (ctx, _) = app().await;
    let res = ctx
        .get("/api/integrations/google/connect", &ctx.cookie)
        .await;
    assert_eq!(res.status, StatusCode::FOUND);
    let cookie = res.cookie.as_deref().unwrap();
    let state = state_of(&res);
    assert_eq!(
        cookie,
        format!(
            "rb_google_state={state}; HttpOnly; SameSite=Lax; Path=/api/integrations/google; Max-Age=600"
        )
    );
    assert_eq!(state.len(), 43, "32 random bytes, base64url");

    let to = Url::parse(res.location.as_deref().unwrap()).unwrap();
    assert_eq!(to.host_str(), Some("accounts.test"));
    let q: std::collections::HashMap<_, _> = to.query_pairs().into_owned().collect();
    for (k, v) in [
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("response_type", "code"),
        ("scope", "https://www.googleapis.com/auth/tasks"),
        ("access_type", "offline"),
        ("prompt", "consent"),
        ("include_granted_scopes", "true"),
        ("state", state.as_str()),
    ] {
        assert_eq!(q.get(k).map(String::as_str), Some(v), "{k}");
    }
    assert_eq!(q.len(), 8);

    // A second start gets a different state.
    let again = ctx
        .get("/api/integrations/google/connect", &ctx.cookie)
        .await;
    assert_ne!(state_of(&again), state);
}

#[tokio::test]
async fn the_secure_flag_follows_the_session_cookie_setting() {
    let stub = StubGoogle::start().await;
    let ctx = TestApp::spawn_as_admin_with(|s| {
        stub.enable(s);
        s.config = std::sync::Arc::new(recipe_box_api::config::Config {
            cookie_secure: true,
            ..(*s.config).clone()
        });
    })
    .await;
    let res = ctx
        .get("/api/integrations/google/connect", &ctx.cookie)
        .await;
    assert!(res.cookie.as_deref().unwrap().contains("; Secure"));
}

#[tokio::test]
async fn a_wrong_or_missing_state_stores_nothing_and_asks_google_nothing() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.accept_code("code-1", REFRESH);
    let state = start(&ctx, &c).await;
    let other = "x".repeat(state.len());

    for (path, cookie) in [
        // different state, same length
        (
            format!("/api/integrations/google/callback?code=code-1&state={other}"),
            with_state(&c, &state),
        ),
        // different length
        (
            "/api/integrations/google/callback?code=code-1&state=short".to_string(),
            with_state(&c, &state),
        ),
        // no state in the address
        (
            "/api/integrations/google/callback?code=code-1".to_string(),
            with_state(&c, &state),
        ),
        // no cookie
        (
            format!("/api/integrations/google/callback?code=code-1&state={state}"),
            c.clone(),
        ),
        // the member said no at Google
        (
            format!("/api/integrations/google/callback?error=access_denied&state={state}"),
            with_state(&c, &state),
        ),
        // no code
        (
            format!("/api/integrations/google/callback?state={state}"),
            with_state(&c, &state),
        ),
    ] {
        let res = ctx.get(&path, &cookie).await;
        assert_eq!(res.status, StatusCode::FOUND, "{path}");
        assert_eq!(
            res.location.as_deref(),
            Some("/settings?google=error"),
            "{path}"
        );
    }
    assert_eq!(connections_stored(&ctx).await, 0);
    assert!(
        stub.requests_to("/token").is_empty(),
        "Google was never asked to exchange a code"
    );
}

#[tokio::test]
async fn a_good_callback_stores_the_token_encrypted_and_clears_the_cookie() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.accept_code("code-1", REFRESH);
    let state = start(&ctx, &c).await;
    let res = ctx
        .get(
            &format!("/api/integrations/google/callback?code=code-1&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    assert_eq!(res.status, StatusCode::FOUND);
    assert_eq!(res.location.as_deref(), Some("/settings?google=connected"));
    let cleared = res.cookie.as_deref().unwrap();
    assert!(
        cleared.starts_with("rb_google_state=;")
            && cleared.contains("Path=/api/integrations/google")
            && cleared.contains("Max-Age=0"),
        "{cleared}"
    );
    assert!(!res.location.as_deref().unwrap().contains("code"));

    // The code was exchanged once, with this app's client and redirect address.
    let exchange = &stub.requests_to("/token")[0];
    assert_eq!(exchange.body["grant_type"], "authorization_code");
    assert_eq!(exchange.body["code"], "code-1");
    assert_eq!(exchange.body["redirect_uri"], REDIRECT_URI);

    // What is stored is not the token, in any encoding that shows it.
    let (sealed, connected_at): (Vec<u8>, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as("select refresh_token, connected_at from google_connection")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(connected_at, epoch());
    assert!(
        sealed.len() >= 12 + REFRESH.len() + 16,
        "nonce + token + tag"
    );
    assert!(
        !sealed
            .windows(8)
            .any(|w| REFRESH.as_bytes().windows(8).any(|t| t == w)),
        "no run of the token's bytes"
    );
    // The same blob opens with the app's key (so it is really sealed, not just mangled).
    use ports::TokenCipher;
    let opened = recipe_box_api::crypto::ChaChaCipher::new(&common::google::KEY)
        .open(&sealed)
        .unwrap();
    assert_eq!(opened.expose(), REFRESH);
}

#[tokio::test]
async fn google_sending_no_refresh_token_or_refusing_the_code_stores_nothing() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();

    // A code Google does not know.
    let state = start(&ctx, &c).await;
    let res = ctx
        .get(
            &format!("/api/integrations/google/callback?code=nope&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    assert_eq!(res.location.as_deref(), Some("/settings?google=error"));

    // A good code, but no refresh token in the answer (the member connected before without `prompt=consent`).
    stub.accept_code("code-2", REFRESH);
    stub.omit_refresh_token();
    let state = start(&ctx, &c).await;
    let res = ctx
        .get(
            &format!("/api/integrations/google/callback?code=code-2&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    assert_eq!(res.location.as_deref(), Some("/settings?google=error"));
    assert_eq!(connections_stored(&ctx).await, 0);
}

#[tokio::test]
async fn connecting_again_replaces_the_token() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    let first: Vec<u8> = sqlx::query_scalar("select refresh_token from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap();
    ctx.clock.advance(chrono::Duration::days(1));
    connect(&ctx, &stub, &c, "code-2", "1//stub-refresh-token-2").await;
    assert_eq!(connections_stored(&ctx).await, 1);
    let (second, at): (Vec<u8>, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as("select refresh_token, connected_at from google_connection")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_ne!(first, second);
    assert_eq!(at, epoch() + chrono::Duration::days(1));
}

#[tokio::test]
async fn export_makes_sections_parent_tasks_and_items_subtasks_in_store_order() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(
        &ctx,
        &[
            "1 cup rice",
            "2 apples",
            "1 lb chicken thighs",
            "1 cup milk",
            "2 tbsp milk",
            "salt",
            "3 onions",
            "1 cup frozen peas",
            "1 widget",
        ],
    )
    .await;
    // Tick the peas.
    let list = ctx.get("/api/grocery", &c).await;
    let peas = list.json["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["name"] == "frozen peas")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    ctx.call(
        Method::PATCH,
        &format!("/api/grocery/items/{peas}"),
        Some(&c),
        Some(json!({ "checked": true })),
    )
    .await
    .assert_status(StatusCode::OK);

    let sent = export(&ctx, &c, json!({})).await;
    sent.assert_status(StatusCode::OK);
    assert_eq!(
        sent.json,
        json!({ "taskListTitle": "Groceries", "sections": 5, "items": 6 })
    );

    let lists = stub.lists();
    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0].1, "Groceries");
    let tree = stub.tree(&lists[0].0);
    assert_eq!(
        titles(&tree),
        [
            ("Produce", vec!["2 apples", "3 onions"]),
            ("Meat", vec!["1 lb chicken thighs"]),
            ("Fridge", vec!["1 cup + 2 tbsp milk"]),
            ("Pantry", vec!["1 cup rice"]),
            ("Other", vec!["1 widget"]),
        ],
        "no ticked peas, no salt (a staple), no empty Freezer"
    );

    // Staples come along when asked.
    let with = export(&ctx, &c, json!({ "includeStaples": true })).await;
    assert_eq!(with.json["items"], 7);
    let tree = stub.tree(&stub.lists()[0].0);
    assert_eq!(
        titles(&tree)[3],
        ("Pantry", vec!["1 cup rice", "salt"]),
        "list order within a section is the app's order"
    );
}

#[tokio::test]
async fn sending_again_replaces_the_tasks_in_the_same_list() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples", "1 lb chicken thighs", "1 cup rice"]).await;
    stub.page_size(2); // several pages of tasks to delete

    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let list_id = stub.lists()[0].0.clone();
    stub.add_task(&list_id, "something typed in the Google app");
    assert_eq!(stub.task_count(&list_id), 3 + 3 + 1);

    // Another item arrives, then the list is sent again.
    ctx.post("/api/grocery/items", &c, json!({ "text": "2 lemons" }))
        .await
        .assert_status(StatusCode::CREATED);
    let again = export(&ctx, &c, json!({})).await;
    assert_eq!(again.json["items"], 4);

    assert_eq!(stub.lists().len(), 1, "same list, not a second one");
    assert_eq!(stub.lists()[0].0, list_id);
    assert_eq!(
        stub.task_count(&list_id),
        3 + 4,
        "nothing left over from the first send"
    );
    assert_eq!(
        titles(&stub.tree(&list_id)),
        [
            ("Produce", vec!["2 apples", "2 lemons"]),
            ("Meat", vec!["1 lb chicken thighs"]),
            ("Pantry", vec!["1 cup rice"]),
        ]
    );
    // It listed more than one page when emptying the list.
    let pages = stub
        .requests_to(&format!("/tasks/v1/lists/{list_id}/tasks"))
        .into_iter()
        .filter(|r| r.method == "GET")
        .count();
    assert!(pages > 2, "{pages} listing requests");

    // The list is remembered in the database.
    let remembered: Option<String> =
        sqlx::query_scalar("select tasklist_id from google_connection")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(remembered.as_deref(), Some(list_id.as_str()));
}

#[tokio::test]
async fn an_empty_grocery_list_still_succeeds_and_empties_the_google_list() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    ctx.delete("/api/grocery", &c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    let sent = export(&ctx, &c, json!({})).await;
    assert_eq!(
        sent.json,
        json!({ "taskListTitle": "Groceries", "sections": 0, "items": 0 })
    );
    assert_eq!(stub.task_count(&stub.lists()[0].0), 0);
}

#[tokio::test]
async fn a_list_deleted_in_google_is_made_again() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let first = stub.lists()[0].0.clone();

    stub.delete_list(&first);
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let lists = stub.lists();
    assert_eq!(lists.len(), 1);
    assert_ne!(lists[0].0, first);
    assert_eq!(
        titles(&stub.tree(&lists[0].0)),
        [("Produce", vec!["2 apples"])]
    );

    // And the new one is the one remembered.
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(stub.lists().len(), 1);
}

#[tokio::test]
async fn a_token_revoked_at_google_is_a_409_and_the_connection_is_gone() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    stub.kill_refresh_token(REFRESH);

    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");
    assert_eq!(connections_stored(&ctx).await, 0);
    let status = ctx.get("/api/integrations/google", &c).await;
    assert_eq!(status.json["connected"], false);
    assert!(stub.lists().is_empty(), "nothing was sent");
}

#[tokio::test]
async fn google_failing_is_a_502_without_leaking_anything() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    stub.fail_tasks_with(Some(503));
    let res = export(&ctx, &c, json!({})).await;
    res.assert_error(StatusCode::BAD_GATEWAY, "google_error");
    let text = String::from_utf8_lossy(&res.bytes);
    assert!(
        !text.contains(REFRESH) && !text.contains("access-") && !text.contains("stub"),
        "{text}"
    );
    // The connection survives a Google outage.
    assert_eq!(connections_stored(&ctx).await, 1);
    stub.fail_tasks_with(None);
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn disconnecting_revokes_the_token_and_forgets_the_connection() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);

    let res = ctx.delete("/api/integrations/google", &c).await;
    res.assert_status(StatusCode::NO_CONTENT);
    assert!(res.bytes.is_empty());
    assert_eq!(stub.revoked(), [REFRESH]);
    assert_eq!(connections_stored(&ctx).await, 0);
    assert_eq!(
        ctx.get("/api/integrations/google", &c).await.json["connected"],
        false
    );
    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");

    // Again with nothing connected: fine, and Google is not asked.
    ctx.delete("/api/integrations/google", &c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(stub.revoked().len(), 1);

    // Connecting afresh starts without the old list.
    connect(&ctx, &stub, &c, "code-2", "1//stub-refresh-token-2").await;
    let remembered: Option<String> =
        sqlx::query_scalar("select tasklist_id from google_connection")
            .fetch_one(&ctx.pool)
            .await
            .unwrap();
    assert_eq!(remembered, None);
}

#[tokio::test]
async fn a_failed_revoke_still_deletes_the_connection() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    stub.fail_revoke_with(500);
    ctx.delete("/api/integrations/google", &c)
        .await
        .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(connections_stored(&ctx).await, 0);
    assert!(stub.revoked().is_empty());
}

#[tokio::test]
async fn deleting_a_member_deletes_their_connection() {
    let (ctx, stub) = app().await;
    let admin = ctx.cookie.clone();
    let mem = ctx.create_user(&admin, a_user().named("mem")).await;
    let mem_session = session_pair(&ctx.login("mem", MEMBER_PASSWORD).await);
    connect(&ctx, &stub, &mem_session, "code-1", REFRESH).await;
    assert_eq!(connections_stored(&ctx).await, 1);
    ctx.delete(
        &format!("/api/users/{}", mem["id"].as_str().unwrap()),
        &admin,
    )
    .await
    .assert_status(StatusCode::NO_CONTENT);
    assert_eq!(connections_stored(&ctx).await, 0);
}

#[tokio::test]
async fn the_export_body_is_checked() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    for body in [
        json!({ "includeStaples": "yes" }),
        json!({ "staples": true }),
    ] {
        export(&ctx, &c, body)
            .await
            .assert_error(StatusCode::BAD_REQUEST, "validation");
    }
}

#[tokio::test]
async fn no_response_the_browser_sees_holds_a_token() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    let mut seen = String::new();
    let mut note = |res: &Res| {
        seen.push_str(&String::from_utf8_lossy(&res.bytes));
        seen.push_str(res.location.as_deref().unwrap_or(""));
        seen.push_str(res.cookie.as_deref().unwrap_or(""));
    };

    stub.accept_code("code-1", REFRESH);
    let start = ctx.get("/api/integrations/google/connect", &c).await;
    note(&start);
    let state = state_of(&start);
    let back = ctx
        .get(
            &format!("/api/integrations/google/callback?code=code-1&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    note(&back);
    note(&ctx.get("/api/integrations/google", &c).await);
    on_the_list(&ctx, &["2 apples"]).await;
    note(&export(&ctx, &c, json!({})).await);
    stub.fail_tasks_with(Some(500));
    note(&export(&ctx, &c, json!({})).await);
    stub.fail_tasks_with(None);
    stub.kill_refresh_token(REFRESH);
    note(&export(&ctx, &c, json!({})).await);
    note(&ctx.delete("/api/integrations/google", &c).await);

    // The stub did get a real access token and the refresh token, so the check below is not vacuous.
    assert!(stub.requests().iter().any(|r| {
        r.authorization
            .as_deref()
            .is_some_and(|a| a.starts_with("Bearer access-"))
    }));
    assert!(!seen.contains(REFRESH), "refresh token reached the browser");
    assert!(
        !seen.contains("access-"),
        "access token reached the browser"
    );
    assert!(
        !seen.contains(common::google::CLIENT_SECRET),
        "client secret reached the browser"
    );
}
