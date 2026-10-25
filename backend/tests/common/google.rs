//! A local stand-in for Google's OAuth token and revoke endpoints and the Tasks API, on 127.0.0.1 (no real
//! network). It records every request, keeps task lists in memory with Google's sibling ordering (a task made
//! without `previous` goes first among its siblings; with `parent` it goes under that task), deletes a task's
//! subtasks with it, pages task listings, and rejects an access token it did not issue.
//!
//! ```ignore
//! let google = StubGoogle::start().await;
//! google.accept_code("code-1", "refresh-1");
//! let app = TestApp::spawn_as_admin_with(|s| google.enable(s)).await;
//! ```

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use axum::{
    Form, Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use recipe_box_api::{config::Secret, crypto::ChaChaCipher, state::AppState};
use serde_json::{Value, json};

pub const CLIENT_ID: &str = "stub-client-id";
pub const CLIENT_SECRET: &str = "stub-client-secret";
pub const PUBLIC_URL: &str = "https://recipes.test";
pub const REDIRECT_URI: &str = "https://recipes.test/api/integrations/google/callback";
/// The key the cipher of a stubbed app uses.
pub const KEY: [u8; 32] = [42; 32];

/// One request the stub received.
#[derive(Clone, Debug)]
pub struct Seen {
    pub method: String,
    pub path: String,
    pub query: HashMap<String, String>,
    /// The form fields or JSON body, as JSON (`Null` when none).
    pub body: Value,
    /// The `Authorization` header, if any.
    pub authorization: Option<String>,
}

#[derive(Clone)]
struct Task {
    id: String,
    title: String,
    parent: Option<String>,
}

#[derive(Default)]
struct List {
    title: String,
    tasks: HashMap<String, Task>,
    /// Sibling order: the key is the parent id (`None` for top-level tasks).
    order: HashMap<Option<String>, Vec<String>>,
}

impl List {
    /// Every task id, parents before their children's turn: depth-first in sibling order.
    fn in_order(&self) -> Vec<String> {
        fn walk(l: &List, parent: Option<String>, out: &mut Vec<String>) {
            for id in l.order.get(&parent).into_iter().flatten() {
                out.push(id.clone());
                walk(l, Some(id.clone()), out);
            }
        }
        let mut out = vec![];
        walk(self, None, &mut out);
        out
    }

    fn remove(&mut self, id: &str) {
        let Some(task) = self.tasks.remove(id) else {
            return;
        };
        if let Some(sibs) = self.order.get_mut(&task.parent) {
            sibs.retain(|s| s != id);
        }
        for child in self.order.remove(&Some(id.to_string())).unwrap_or_default() {
            self.remove(&child);
        }
    }
}

#[derive(Default)]
struct Inner {
    /// code -> refresh token it is worth
    codes: HashMap<String, String>,
    /// Refresh tokens that answer `invalid_grant` from now on.
    dead: HashSet<String>,
    /// Access tokens handed out -> the refresh token they came from.
    access: HashMap<String, String>,
    revoked: Vec<String>,
    revoke_status: Option<u16>,
    /// Every Tasks call answers this status.
    tasks_status: Option<u16>,
    /// The code exchange leaves out the refresh token.
    omit_refresh_token: bool,
    page_size: Option<usize>,
    lists: Vec<(String, List)>,
    seen: Vec<Seen>,
    counter: u64,
}

#[derive(Clone)]
pub struct StubGoogle {
    /// `http://127.0.0.1:<port>`
    pub base_url: String,
    inner: Arc<Mutex<Inner>>,
}

type Shared = State<Arc<Mutex<Inner>>>;

impl StubGoogle {
    pub async fn start() -> Self {
        let inner = Arc::new(Mutex::new(Inner::default()));
        let app = Router::new()
            .route("/token", post(token))
            .route("/revoke", post(revoke))
            .route("/tasks/v1/users/@me/lists", post(make_list))
            .route("/tasks/v1/users/@me/lists/{id}", get(get_list))
            .route(
                "/tasks/v1/lists/{id}/tasks",
                get(list_tasks).post(make_task),
            )
            .route("/tasks/v1/lists/{id}/tasks/{task}", delete(delete_task))
            .with_state(inner.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { base_url, inner }
    }

    /// Points `state` at this stub: the Google adapter on the stub's hosts, and the real cipher.
    pub fn enable(&self, state: &mut AppState) {
        let urls = adapter_google::GoogleUrls {
            auth: "https://accounts.test/o/oauth2/v2/auth".into(),
            token: format!("{}/token", self.base_url),
            revoke: format!("{}/revoke", self.base_url),
            tasks: format!("{}/tasks/v1", self.base_url),
        };
        let client = adapter_google::GoogleTasksClient::with_base_urls(
            CLIENT_ID.into(),
            Secret::new(CLIENT_SECRET),
            PUBLIC_URL,
            urls,
        )
        .unwrap();
        state.google = Arc::new(client);
        state.cipher = Arc::new(ChaChaCipher::new(&KEY));
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap()
    }

    // ---- scripting -----------------------------------------------------------------------------------------

    /// `code` can be exchanged (once) for the refresh token `refresh`.
    pub fn accept_code(&self, code: &str, refresh: &str) {
        self.lock().codes.insert(code.into(), refresh.into());
    }

    /// From now on refreshing with this token answers `invalid_grant` (the member revoked it at Google).
    pub fn kill_refresh_token(&self, refresh: &str) {
        self.lock().dead.insert(refresh.into());
    }

    pub fn fail_revoke_with(&self, status: u16) {
        self.lock().revoke_status = Some(status);
    }

    pub fn fail_tasks_with(&self, status: Option<u16>) {
        self.lock().tasks_status = status;
    }

    pub fn omit_refresh_token(&self) {
        self.lock().omit_refresh_token = true;
    }

    /// At most this many tasks per page, whatever `maxResults` asks.
    pub fn page_size(&self, n: usize) {
        self.lock().page_size = Some(n);
    }

    /// The member deleted the list in Google Tasks.
    pub fn delete_list(&self, id: &str) {
        self.lock().lists.retain(|(l, _)| l != id);
    }

    /// Someone (the member, in the Google app) added a task by hand.
    pub fn add_task(&self, list: &str, title: &str) {
        let mut g = self.lock();
        g.counter += 1;
        let id = format!("manual-{}", g.counter);
        let (_, l) = g.lists.iter_mut().find(|(l, _)| l == list).unwrap();
        l.tasks.insert(
            id.clone(),
            Task {
                id: id.clone(),
                title: title.into(),
                parent: None,
            },
        );
        l.order.entry(None).or_default().push(id);
    }

    // ---- what the stub saw ---------------------------------------------------------------------------------

    pub fn requests(&self) -> Vec<Seen> {
        self.lock().seen.clone()
    }

    /// Requests whose path starts with `prefix`.
    pub fn requests_to(&self, prefix: &str) -> Vec<Seen> {
        self.requests()
            .into_iter()
            .filter(|r| r.path.starts_with(prefix))
            .collect()
    }

    pub fn revoked(&self) -> Vec<String> {
        self.lock().revoked.clone()
    }

    /// `(id, title)` of every list.
    pub fn lists(&self) -> Vec<(String, String)> {
        self.lock()
            .lists
            .iter()
            .map(|(id, l)| (id.clone(), l.title.clone()))
            .collect()
    }

    /// The list as a person sees it: each top-level task with its subtasks' titles, in order.
    pub fn tree(&self, list: &str) -> Vec<(String, Vec<String>)> {
        let g = self.lock();
        let (_, l) = g.lists.iter().find(|(id, _)| id == list).unwrap();
        l.order
            .get(&None)
            .into_iter()
            .flatten()
            .map(|id| {
                let children = l
                    .order
                    .get(&Some(id.clone()))
                    .into_iter()
                    .flatten()
                    .map(|c| l.tasks[c].title.clone())
                    .collect();
                (l.tasks[id].title.clone(), children)
            })
            .collect()
    }

    /// How many tasks (parents and subtasks) the list holds.
    pub fn task_count(&self, list: &str) -> usize {
        let g = self.lock();
        g.lists
            .iter()
            .find(|(id, _)| id == list)
            .map_or(0, |(_, l)| l.tasks.len())
    }
}

// ---- handlers --------------------------------------------------------------------------------------------

fn record(
    g: &mut Inner,
    method: &str,
    path: &str,
    q: HashMap<String, String>,
    body: Value,
    h: &HeaderMap,
) {
    g.seen.push(Seen {
        method: method.into(),
        path: path.into(),
        query: q,
        body,
        authorization: h
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(Into::into),
    });
}

fn oauth_error(status: u16, error: &str) -> Response {
    (
        StatusCode::from_u16(status).unwrap(),
        Json(json!({ "error": error, "error_description": "stub" })),
    )
        .into_response()
}

async fn token(
    State(inner): Shared,
    headers: HeaderMap,
    Form(f): Form<HashMap<String, String>>,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(&mut g, "POST", "/token", HashMap::new(), json!(f), &headers);
    let field = |k: &str| f.get(k).map(String::as_str);
    if field("client_id") != Some(CLIENT_ID) || field("client_secret") != Some(CLIENT_SECRET) {
        return oauth_error(401, "invalid_client");
    }
    g.counter += 1;
    let n = g.counter;
    match field("grant_type") {
        Some("authorization_code") => {
            if field("redirect_uri") != Some(REDIRECT_URI) {
                return oauth_error(400, "redirect_uri_mismatch");
            }
            let Some(refresh) = field("code").and_then(|c| g.codes.remove(c)) else {
                return oauth_error(400, "invalid_grant");
            };
            let access = format!("access-{n}");
            g.access.insert(access.clone(), refresh.clone());
            let mut body =
                json!({ "access_token": access, "expires_in": 3599, "token_type": "Bearer" });
            if !g.omit_refresh_token {
                body["refresh_token"] = json!(refresh);
            }
            Json(body).into_response()
        }
        Some("refresh_token") => {
            let refresh = field("refresh_token").unwrap_or_default().to_string();
            let known = g.access.values().any(|r| *r == refresh);
            if !known || g.dead.contains(&refresh) {
                return oauth_error(400, "invalid_grant");
            }
            let access = format!("access-{n}");
            g.access.insert(access.clone(), refresh);
            Json(json!({ "access_token": access, "expires_in": 3599, "token_type": "Bearer" }))
                .into_response()
        }
        _ => oauth_error(400, "unsupported_grant_type"),
    }
}

async fn revoke(
    State(inner): Shared,
    headers: HeaderMap,
    Form(f): Form<HashMap<String, String>>,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "POST",
        "/revoke",
        HashMap::new(),
        json!(f),
        &headers,
    );
    if let Some(status) = g.revoke_status {
        return oauth_error(status, "stub_failure");
    }
    let token = f.get("token").cloned().unwrap_or_default();
    g.revoked.push(token.clone());
    g.dead.insert(token);
    StatusCode::OK.into_response()
}

/// Checks the bearer token and the forced failure; `Some` is the answer to give instead.
fn tasks_gate(g: &Inner, headers: &HeaderMap) -> Option<Response> {
    if let Some(status) = g.tasks_status {
        return Some(oauth_error(status, "stub_failure"));
    }
    let bearer = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    match bearer {
        Some(t) if g.access.contains_key(t) => None,
        _ => Some(oauth_error(401, "unauthenticated")),
    }
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": { "code": 404, "message": "Not Found" } })),
    )
        .into_response()
}

async fn make_list(State(inner): Shared, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "POST",
        "/tasks/v1/users/@me/lists",
        HashMap::new(),
        body.clone(),
        &headers,
    );
    if let Some(r) = tasks_gate(&g, &headers) {
        return r;
    }
    g.counter += 1;
    let id = format!("list-{}", g.counter);
    let title = body["title"].as_str().unwrap_or_default().to_string();
    g.lists.push((
        id.clone(),
        List {
            title: title.clone(),
            ..Default::default()
        },
    ));
    Json(json!({ "id": id, "title": title })).into_response()
}

async fn get_list(State(inner): Shared, Path(id): Path<String>, headers: HeaderMap) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "GET",
        &format!("/tasks/v1/users/@me/lists/{id}"),
        HashMap::new(),
        Value::Null,
        &headers,
    );
    if let Some(r) = tasks_gate(&g, &headers) {
        return r;
    }
    match g.lists.iter().find(|(l, _)| *l == id) {
        Some((id, l)) => Json(json!({ "id": id, "title": l.title })).into_response(),
        None => not_found(),
    }
}

async fn list_tasks(
    State(inner): Shared,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "GET",
        &format!("/tasks/v1/lists/{id}/tasks"),
        q.clone(),
        Value::Null,
        &headers,
    );
    if let Some(r) = tasks_gate(&g, &headers) {
        return r;
    }
    let size = g.page_size.unwrap_or(100).min(
        q.get("maxResults")
            .and_then(|m| m.parse().ok())
            .unwrap_or(20),
    );
    let Some((_, l)) = g.lists.iter().find(|(l, _)| *l == id) else {
        return not_found();
    };
    let ids = l.in_order();
    let start: usize = q.get("pageToken").and_then(|t| t.parse().ok()).unwrap_or(0);
    let items: Vec<Value> = ids
        .iter()
        .skip(start)
        .take(size)
        .map(|t| json!({ "id": t, "title": l.tasks[t].title }))
        .collect();
    let mut body = json!({ "kind": "tasks#tasks", "items": items });
    if start + size < ids.len() {
        body["nextPageToken"] = json!((start + size).to_string());
    }
    Json(body).into_response()
}

async fn make_task(
    State(inner): Shared,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "POST",
        &format!("/tasks/v1/lists/{id}/tasks"),
        q.clone(),
        body.clone(),
        &headers,
    );
    if let Some(r) = tasks_gate(&g, &headers) {
        return r;
    }
    g.counter += 1;
    let task_id = format!("task-{}", g.counter);
    let Some((_, l)) = g.lists.iter_mut().find(|(l, _)| *l == id) else {
        return not_found();
    };
    let parent = q.get("parent").cloned();
    if parent.as_ref().is_some_and(|p| !l.tasks.contains_key(p)) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": { "code": 400, "message": "Invalid parent" } })),
        )
            .into_response();
    }
    let siblings = l.order.entry(parent.clone()).or_default();
    // Google: no `previous` means first among the siblings.
    let at = match q.get("previous") {
        None => 0,
        Some(prev) => match siblings.iter().position(|s| s == prev) {
            Some(i) => i + 1,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": { "code": 400, "message": "Invalid previous" } })),
                )
                    .into_response();
            }
        },
    };
    siblings.insert(at, task_id.clone());
    let title = body["title"].as_str().unwrap_or_default().to_string();
    l.tasks.insert(
        task_id.clone(),
        Task {
            id: task_id.clone(),
            title: title.clone(),
            parent,
        },
    );
    Json(json!({ "id": task_id, "title": title })).into_response()
}

async fn delete_task(
    State(inner): Shared,
    Path((id, task)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "DELETE",
        &format!("/tasks/v1/lists/{id}/tasks/{task}"),
        HashMap::new(),
        Value::Null,
        &headers,
    );
    if let Some(r) = tasks_gate(&g, &headers) {
        return r;
    }
    let Some((_, l)) = g.lists.iter_mut().find(|(l, _)| *l == id) else {
        return not_found();
    };
    if !l.tasks.contains_key(&task) {
        return not_found();
    }
    l.remove(&task);
    StatusCode::NO_CONTENT.into_response()
}
