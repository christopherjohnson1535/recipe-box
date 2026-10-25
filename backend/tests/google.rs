//! Google Tasks export (GRO-5) over HTTP against a real Postgres and a local stub of Google (`common/google.rs`).
//! The rules (what is sent, what a dead token means) are also tested in `crates/app/tests/google.rs`; this file
//! checks the routes, the cookie, the redirects, the stored token and that no token ever reaches the browser.

mod common;

use axum::http::{Method, StatusCode};
use common::{
    MEMBER_PASSWORD, Res, TestApp, a_recipe, a_user, epoch,
    google::{CLIENT_ID, Hiccup, REDIRECT_URI, StubGoogle},
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

/// The response clears the state cookie.
#[track_caller]
fn assert_state_cookie_cleared(res: &Res, what: &str) {
    let c = res.cookie.as_deref().unwrap_or("");
    assert!(
        c.starts_with("rb_google_state=;")
            && c.contains("Path=/api/integrations/google")
            && c.contains("Max-Age=0"),
        "{what}: {c}"
    );
}

/// Whether the stored token is there (a member whose token Google dropped keeps a row without one).
async fn token_stored(ctx: &TestApp) -> bool {
    sqlx::query_scalar("select refresh_token is not null from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap()
}

async fn remembered_list(ctx: &TestApp) -> Option<String> {
    sqlx::query_scalar("select tasklist_id from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap()
}

async fn lease(ctx: &TestApp) -> Option<chrono::DateTime<chrono::Utc>> {
    sqlx::query_scalar("select export_started_at from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap()
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
        assert_state_cookie_cleared(&res, &path);
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
    assert_state_cookie_cleared(&res, "code refused");

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
    assert_state_cookie_cleared(&res, "no refresh token");

    // Google grants something else than the Tasks scope: a token that cannot send is not stored.
    stub.accept_code("code-3", REFRESH);
    stub.grant_scope("openid email");
    let state = start(&ctx, &c).await;
    let res = ctx
        .get(
            &format!("/api/integrations/google/callback?code=code-3&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    assert_eq!(res.location.as_deref(), Some("/settings?google=error"));
    assert_state_cookie_cleared(&res, "wrong scope");
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
    // The token it replaced is revoked at Google, not left alive there.
    assert_eq!(stub.revoked(), [REFRESH]);
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
async fn a_token_revoked_at_google_is_a_409_and_reconnecting_reuses_the_list() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let list = stub.lists()[0].0.clone();

    stub.kill_refresh_token(REFRESH);
    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");
    // Not connected any more, but the row remembers the list.
    assert!(!token_stored(&ctx).await);
    assert_eq!(remembered_list(&ctx).await.as_deref(), Some(list.as_str()));
    let status = ctx.get("/api/integrations/google", &c).await;
    assert_eq!(status.json["connected"], false);
    assert_eq!(status.json["connectedAt"], Value::Null);
    assert_eq!(stub.lists().len(), 1);
    // Asking again is the same answer.
    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");

    // Reconnect: the dead token has nothing to revoke, and the next send fills the same list.
    connect(&ctx, &stub, &c, "code-2", "1//stub-refresh-token-2").await;
    assert!(stub.revoked().is_empty());
    assert_eq!(
        ctx.get("/api/integrations/google", &c).await.json["connected"],
        true
    );
    ctx.post("/api/grocery/items", &c, json!({ "text": "2 lemons" }))
        .await
        .assert_status(StatusCode::CREATED);
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(stub.lists().len(), 1, "no second Groceries list");
    assert_eq!(
        titles(&stub.tree(&list)),
        [("Produce", vec!["2 apples", "2 lemons"])]
    );
}

#[tokio::test]
async fn a_token_that_will_not_open_is_not_deleted() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    let good: Vec<u8> = sqlx::query_scalar("select refresh_token from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap();

    // As if the server now ran with another TOKEN_ENCRYPTION_KEY.
    let mut wrong = good.clone();
    *wrong.last_mut().unwrap() ^= 1;
    sqlx::query("update google_connection set refresh_token = $1")
        .bind(&wrong)
        .execute(&ctx.pool)
        .await
        .unwrap();
    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::CONFLICT, "google_not_connected");
    assert_eq!(connections_stored(&ctx).await, 1);
    let kept: Vec<u8> = sqlx::query_scalar("select refresh_token from google_connection")
        .fetch_one(&ctx.pool)
        .await
        .unwrap();
    assert_eq!(kept, wrong, "left as it was");
    assert!(stub.requests_to("/tasks").is_empty(), "nothing was sent");

    // The right key is back: the same row works again.
    sqlx::query("update google_connection set refresh_token = $1")
        .bind(&good)
        .execute(&ctx.pool)
        .await
        .unwrap();
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
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

#[tokio::test]
async fn a_failed_first_send_and_a_second_one_leave_one_list_with_the_current_items() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples", "1 lb chicken thighs", "1 cup rice"]).await;

    // Calls: find a list called Groceries, make it, list its tasks, Produce, apples; then Google fails on Meat.
    stub.fail_tasks_after(5, 503);
    let res = export(&ctx, &c, json!({})).await;
    res.assert_error(StatusCode::BAD_GATEWAY, "google_error");
    let message = res.json["error"]["message"].as_str().unwrap();
    assert!(
        message.contains("may be incomplete; send it again"),
        "{message}"
    );
    let lists = stub.lists();
    assert_eq!(lists.len(), 1, "the list exists");
    let list = lists[0].0.clone();
    assert_eq!(titles(&stub.tree(&list)), [("Produce", vec!["2 apples"])]);
    assert_eq!(remembered_list(&ctx).await.as_deref(), Some(list.as_str()));
    assert!(
        lease(&ctx).await.is_none(),
        "a failed send lets go of its lease"
    );

    stub.fail_tasks_with(None);
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(
        stub.lists().len(),
        1,
        "the second send did not make another list"
    );
    assert_eq!(
        titles(&stub.tree(&list)),
        [
            ("Produce", vec!["2 apples"]),
            ("Meat", vec!["1 lb chicken thighs"]),
            ("Pantry", vec!["1 cup rice"]),
        ]
    );
    assert_eq!(stub.task_count(&list), 6, "nothing left from the first try");
}

#[tokio::test]
async fn a_throttled_call_is_tried_again_after_the_pause_google_asks_for() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples", "1 cup rice"]).await;

    // Find, make, list tasks, Produce, apples ... the sixth call (Pantry) is told to wait a second.
    stub.hiccup(
        5,
        1,
        Hiccup::TooMany {
            retry_after: Some(1),
        },
    );
    let started = std::time::Instant::now();
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert!(
        started.elapsed() >= std::time::Duration::from_millis(900),
        "{:?}",
        started.elapsed()
    );
    let list = stub.lists()[0].0.clone();
    assert_eq!(
        titles(&stub.tree(&list)),
        [
            ("Produce", vec!["2 apples"]),
            ("Pantry", vec!["1 cup rice"])
        ],
        "the throttled task was made once"
    );
    let makes = stub
        .requests_to(&format!("/tasks/v1/lists/{list}/tasks"))
        .iter()
        .filter(|r| r.method == "POST")
        .count();
    assert_eq!(makes, 5, "4 tasks and 1 repeat");
}

#[tokio::test]
async fn rate_limit_403s_and_server_errors_on_reads_are_tried_again() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let list = stub.lists()[0].0.clone();
    let tasks_path = format!("/tasks/v1/lists/{list}/tasks");

    // 403 rateLimitExceeded on the list lookup, then a 503 on the listing of tasks.
    stub.hiccup(0, 2, Hiccup::RateLimited);
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    stub.hiccup(1, 2, Hiccup::Status(503));
    let before = stub.requests_to(&tasks_path).len();
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert!(stub.requests_to(&tasks_path).len() > before + 3);
    assert_eq!(stub.lists().len(), 1);
    assert_eq!(titles(&stub.tree(&list)), [("Produce", vec!["2 apples"])]);
}

#[tokio::test]
async fn a_call_that_keeps_failing_gives_up_after_three_tries_and_a_plain_403_is_not_retried() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;

    stub.hiccup(
        0,
        100,
        Hiccup::TooMany {
            retry_after: Some(0),
        },
    );
    export(&ctx, &c, json!({}))
        .await
        .assert_error(StatusCode::BAD_GATEWAY, "google_error");
    assert_eq!(stub.requests_to("/tasks").len(), 3);
    assert_eq!(connections_stored(&ctx).await, 1);
    assert!(token_stored(&ctx).await);
    assert!(lease(&ctx).await.is_none());

    // 403 for another reason (say the Tasks API is not enabled for the project) is final.
    stub.fail_tasks_with(None);
    stub.fail_tasks_with(Some(403));
    let before = stub.requests_to("/tasks").len();
    let res = export(&ctx, &c, json!({})).await;
    res.assert_error(StatusCode::BAD_GATEWAY, "google_error");
    assert_eq!(stub.requests_to("/tasks").len(), before + 1);
    assert!(
        res.json["error"]["message"]
            .as_str()
            .unwrap()
            .contains("(403)")
    );
}

#[tokio::test]
async fn emptying_the_list_does_not_rely_on_a_parent_taking_its_subtasks_along() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.strict_deletes(); // deleting a task that still has subtasks answers 400
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples", "3 onions", "1 cup rice"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    let list = stub.lists()[0].0.clone();
    stub.add_task(&list, "typed in the Google app");
    stub.add_completed_task(&list, "ticked in the Google app");
    assert_eq!(stub.task_count(&list), 5 + 2);

    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(
        stub.task_count(&list),
        5,
        "completed and hidden tasks are cleared too"
    );
    assert_eq!(
        titles(&stub.tree(&list)),
        [
            ("Produce", vec!["2 apples", "3 onions"]),
            ("Pantry", vec!["1 cup rice"])
        ]
    );
    // It asked for hidden and completed tasks, a full page at a time.
    let listing = stub
        .requests_to(&format!("/tasks/v1/lists/{list}/tasks"))
        .into_iter()
        .find(|r| r.method == "GET")
        .unwrap();
    for (k, v) in [
        ("showHidden", "true"),
        ("showCompleted", "true"),
        ("maxResults", "100"),
    ] {
        assert_eq!(listing.query.get(k).map(String::as_str), Some(v), "{k}");
    }
    // A parent deleted before its subtasks would have been refused (400) and failed the send.
    assert_eq!(stub.deleted_tasks().len(), 7);
}

#[tokio::test]
async fn a_groceries_list_google_already_has_is_used_and_not_duplicated() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.add_list("Errands");
    stub.add_list("groceries"); // not the same title
    stub.add_list("Groceries ");
    let mine = stub.add_list("Groceries");
    stub.add_list("Groceries");
    stub.add_task(&mine, "left over from before");
    stub.page_size(2); // the list is on the third page of lists
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;

    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(stub.lists().len(), 5, "no new list");
    assert_eq!(titles(&stub.tree(&mine)), [("Produce", vec!["2 apples"])]);
    assert_eq!(remembered_list(&ctx).await.as_deref(), Some(mine.as_str()));
    let looked = stub.requests_to("/tasks/v1/users/@me/lists").len();
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(
        stub.requests_to("/tasks/v1/users/@me/lists").len(),
        looked + 1,
        "known by id from now on: one lookup, no search"
    );

    // Nothing by that name: a new one is made.
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.add_list("Errands");
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert_eq!(stub.lists().len(), 2);
}

#[tokio::test]
async fn only_one_send_per_member_at_a_time_across_processes() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;

    // Another process started a send a minute ago and is still at it.
    sqlx::query("update google_connection set export_started_at = $1")
        .bind(epoch() - chrono::Duration::minutes(1))
        .execute(&ctx.pool)
        .await
        .unwrap();
    let res = export(&ctx, &c, json!({})).await;
    res.assert_error(StatusCode::CONFLICT, "conflict");
    assert_eq!(
        res.json["error"]["message"],
        "A send to Google Tasks is already running."
    );
    assert!(
        stub.requests()
            .iter()
            .all(|r| !r.path.starts_with("/tasks"))
    );
    assert_eq!(
        lease(&ctx).await,
        Some(epoch() - chrono::Duration::minutes(1)),
        "the refused send did not touch the lease"
    );

    // One that started over two minutes ago died; the lease is taken over, and let go of at the end.
    sqlx::query("update google_connection set export_started_at = $1")
        .bind(epoch() - chrono::Duration::minutes(3))
        .execute(&ctx.pool)
        .await
        .unwrap();
    export(&ctx, &c, json!({}))
        .await
        .assert_status(StatusCode::OK);
    assert!(lease(&ctx).await.is_none());

    // Another member is not held up by this one.
    sqlx::query("update google_connection set export_started_at = $1")
        .bind(epoch())
        .execute(&ctx.pool)
        .await
        .unwrap();
    ctx.create_user(&c, a_user().named("mem")).await;
    let mem = session_pair(&ctx.login("mem", MEMBER_PASSWORD).await);
    connect(&ctx, &stub, &mem, "code-2", "1//stub-refresh-token-2").await;
    export(&ctx, &mem, json!({}))
        .await
        .assert_status(StatusCode::OK);
}

#[tokio::test]
async fn a_send_that_takes_too_long_gives_up_and_says_the_list_may_be_incomplete() {
    let stub = StubGoogle::start().await;
    let ctx =
        TestApp::spawn_as_admin_with(|s| stub.enable_with_deadline(s, std::time::Duration::ZERO))
            .await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    let res = export(&ctx, &c, json!({})).await;
    res.assert_error(StatusCode::BAD_GATEWAY, "google_error");
    let message = res.json["error"]["message"].as_str().unwrap();
    assert!(
        message.contains("took too long") && message.contains("send it again"),
        "{message}"
    );
    assert!(lease(&ctx).await.is_none());
    assert_eq!(remembered_list(&ctx).await, Some(stub.lists()[0].0.clone()));
}

#[tokio::test]
async fn google_refusing_the_client_is_a_502_and_does_not_forget_the_token() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    connect(&ctx, &stub, &c, "code-1", REFRESH).await;
    on_the_list(&ctx, &["2 apples"]).await;
    // Only `invalid_grant` means the member has to reconnect; these are the operator's to fix.
    for (status, error) in [(400, "unauthorized_client"), (401, "invalid_client")] {
        stub.refuse_refresh_with(status, error);
        export(&ctx, &c, json!({}))
            .await
            .assert_error(StatusCode::BAD_GATEWAY, "google_error");
        assert!(token_stored(&ctx).await, "{error}");
        assert_eq!(
            ctx.get("/api/integrations/google", &c).await.json["connected"],
            true
        );
    }
}

/// What the `tracing` subscriber of a test wrote.
#[derive(Clone, Default)]
struct Captured(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

impl std::io::Write for Captured {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn the_request_log_never_holds_the_callbacks_code_or_state() {
    let (ctx, stub) = app().await;
    let c = ctx.cookie.clone();
    stub.accept_code("4/0A-secret-code", REFRESH);
    let state = start(&ctx, &c).await;

    // The runtime of `#[tokio::test]` is single-threaded, so the request is traced on this thread.
    let log = Captured::default();
    let writer = log.clone();
    let _guard = tracing::subscriber::set_default(
        tracing_subscriber::fmt()
            .with_max_level(tracing::Level::DEBUG)
            .with_writer(move || writer.clone())
            .with_ansi(false)
            .finish(),
    );
    let back = ctx
        .get(
            &format!("/api/integrations/google/callback?code=4/0A-secret-code&state={state}"),
            &with_state(&c, &state),
        )
        .await;
    assert_eq!(back.location.as_deref(), Some("/settings?google=connected"));
    let out = String::from_utf8(log.0.lock().unwrap().clone()).unwrap();
    assert!(
        out.contains("path=/api/integrations/google/callback"),
        "the request is logged at all: {out}"
    );
    assert!(
        !out.contains("secret-code") && !out.contains(&state) && !out.contains("code="),
        "{out}"
    );
}
