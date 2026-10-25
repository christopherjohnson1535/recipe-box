//! A local stand-in for Google's OAuth token and revoke endpoints and the Tasks API, on 127.0.0.1 (no real
//! network). It records every request, keeps task lists in memory with Google's sibling ordering (a task made
//! without `previous` goes first among its siblings; with `parent` it goes under that task), pages task and list
//! listings (20 by default, 100 at most), hides completed and hidden tasks unless asked (`showCompleted`,
//! `showHidden`), answers 404 for a list or task it does not have, and rejects an access token it did not issue.
//! Whether deleting a task deletes its subtasks is not documented by Google; by default the stub does, and
//! `strict_deletes` makes it refuse (400) to delete a task that still has subtasks, so a test can prove the
//! adapter does not rely on either. Failures can be scripted: `fail_tasks_after`, `hiccup`.
//!
//! ```ignore
//! let google = StubGoogle::start().await;
//! google.accept_code("code-1", "refresh-1");
//! let app = TestApp::spawn_as_admin_with(|s| google.enable(s)).await;
//! ```

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::Duration,
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
    /// Ticked off.
    completed: bool,
    /// Completed in a Google app: listed only with `showHidden=true`.
    hidden: bool,
}

/// How a scripted Tasks call goes wrong.
#[derive(Clone, Copy, Debug)]
pub enum Hiccup {
    /// `429` with this `Retry-After` (seconds).
    TooMany { retry_after: Option<u32> },
    /// `403` with the reason `rateLimitExceeded`.
    RateLimited,
    /// Any other status.
    Status(u16),
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
    /// Tasks calls seen so far (throttled and failed ones too).
    tasks_calls: usize,
    /// Every Tasks call after this many answers this status.
    fail_after: Option<(usize, u16)>,
    /// `(calls to let through first, calls to spoil, how)`.
    hiccups: Option<(usize, usize, Hiccup)>,
    /// Deleting a task with subtasks answers 400.
    strict_deletes: bool,
    /// The `scope` the code exchange reports (default: the Tasks scope).
    granted_scope: Option<String>,
    /// A refresh answers this status and error instead of an access token.
    refresh_refused: Option<(u16, String)>,
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
            .route("/tasks/v1/users/@me/lists", get(list_lists).post(make_list))
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
        self.enable_with_deadline(state, Duration::from_secs(30));
    }

    /// Like `enable`, with a limit on how long filling a list may take.
    pub fn enable_with_deadline(&self, state: &mut AppState, fill_deadline: Duration) {
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
        .unwrap()
        .with_timing(Duration::from_millis(5), fill_deadline);
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

    /// Every Tasks call answers this status (`None`: back to normal, scripted `fail_tasks_after` and `hiccup` included).
    pub fn fail_tasks_with(&self, status: Option<u16>) {
        let mut g = self.lock();
        g.tasks_status = status;
        if status.is_none() {
            g.fail_after = None;
            g.hiccups = None;
        }
    }

    /// The first `calls` Tasks calls from now on work, every later one answers `status` (a failure mid-run).
    pub fn fail_tasks_after(&self, calls: usize, status: u16) {
        let mut g = self.lock();
        g.fail_after = Some((g.tasks_calls + calls, status));
    }

    /// After `after` more Tasks calls, the next `calls` go wrong in this way; the ones after that work again.
    pub fn hiccup(&self, after: usize, calls: usize, how: Hiccup) {
        let mut g = self.lock();
        g.hiccups = Some((g.tasks_calls + after, calls, how));
    }

    /// Deleting a task that still has subtasks answers 400 instead of taking them along.
    pub fn strict_deletes(&self) {
        self.lock().strict_deletes = true;
    }

    /// The code exchange reports this granted `scope`.
    pub fn grant_scope(&self, scope: &str) {
        self.lock().granted_scope = Some(scope.into());
    }

    /// Refreshing a token answers this status and OAuth error (not `invalid_grant`, which `kill_refresh_token` gives).
    pub fn refuse_refresh_with(&self, status: u16, error: &str) {
        self.lock().refresh_refused = Some((status, error.into()));
    }

    pub fn omit_refresh_token(&self) {
        self.lock().omit_refresh_token = true;
    }

    /// At most this many tasks per page, whatever `maxResults` asks.
    pub fn page_size(&self, n: usize) {
        self.lock().page_size = Some(n);
    }

    /// The member already has a list with this title; returns its id.
    pub fn add_list(&self, title: &str) -> String {
        let mut g = self.lock();
        g.counter += 1;
        let id = format!("manual-list-{}", g.counter);
        g.lists.push((
            id.clone(),
            List {
                title: title.into(),
                ..Default::default()
            },
        ));
        id
    }

    /// The member deleted the list in Google Tasks.
    pub fn delete_list(&self, id: &str) {
        self.lock().lists.retain(|(l, _)| l != id);
    }

    /// Someone (the member, in the Google app) added a task by hand.
    pub fn add_task(&self, list: &str, title: &str) {
        self.add_manual_task(list, title, false, false);
    }

    /// A task the member ticked off in the Google app: completed and hidden, so it is listed only with
    /// `showHidden=true`.
    pub fn add_completed_task(&self, list: &str, title: &str) {
        self.add_manual_task(list, title, true, true);
    }

    fn add_manual_task(&self, list: &str, title: &str, completed: bool, hidden: bool) {
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
                completed,
                hidden,
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

    /// The ids of the tasks deleted, in the order they were asked for.
    pub fn deleted_tasks(&self) -> Vec<String> {
        self.requests()
            .into_iter()
            .filter(|r| r.method == "DELETE")
            .filter_map(|r| r.path.rsplit('/').next().map(String::from))
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
            let scope = g
                .granted_scope
                .clone()
                .unwrap_or_else(|| "https://www.googleapis.com/auth/tasks".into());
            let mut body = json!({ "access_token": access, "expires_in": 3599, "token_type": "Bearer", "scope": scope });
            if !g.omit_refresh_token {
                body["refresh_token"] = json!(refresh);
            }
            Json(body).into_response()
        }
        Some("refresh_token") => {
            if let Some((status, error)) = g.refresh_refused.clone() {
                return oauth_error(status, &error);
            }
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

/// Checks the bearer token and the scripted failures; `Some` is the answer to give instead.
fn tasks_gate(g: &mut Inner, headers: &HeaderMap) -> Option<Response> {
    g.tasks_calls += 1;
    let calls = g.tasks_calls;
    if let Some((_, left, how)) = g
        .hiccups
        .as_mut()
        .filter(|(after, left, _)| calls > *after && *left > 0)
    {
        *left -= 1;
        return Some(match *how {
            Hiccup::TooMany { retry_after } => {
                let mut res = oauth_error(429, "rate_limited");
                if let Some(secs) = retry_after {
                    res.headers_mut().insert("retry-after", secs.into());
                }
                res
            }
            Hiccup::RateLimited => (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": { "code": 403, "message": "Rate Limit Exceeded", "errors": [
                    { "domain": "usageLimits", "reason": "rateLimitExceeded", "message": "Rate Limit Exceeded" }
                ] } })),
            )
                .into_response(),
            Hiccup::Status(status) => oauth_error(status, "stub_failure"),
        });
    }
    if let Some(status) = g.tasks_status {
        return Some(oauth_error(status, "stub_failure"));
    }
    if let Some((_, status)) = g.fail_after.filter(|(after, _)| g.tasks_calls > *after) {
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
    if let Some(r) = tasks_gate(&mut g, &headers) {
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
    if let Some(r) = tasks_gate(&mut g, &headers) {
        return r;
    }
    match g.lists.iter().find(|(l, _)| *l == id) {
        Some((id, l)) => Json(json!({ "id": id, "title": l.title })).into_response(),
        None => not_found(),
    }
}

/// The page of `ids` a listing asks for: `maxResults` (20 if absent, 100 at most, and at most `page_size`) from the
/// `pageToken` (an offset in the stub), and the token of the next page.
fn page_of<T: Clone>(
    g: &Inner,
    q: &HashMap<String, String>,
    all: &[T],
    default: usize,
) -> (Vec<T>, Option<String>) {
    let size = g.page_size.unwrap_or(100).min(
        q.get("maxResults")
            .and_then(|m| m.parse::<usize>().ok())
            .unwrap_or(default)
            .min(100),
    );
    let start: usize = q.get("pageToken").and_then(|t| t.parse().ok()).unwrap_or(0);
    let items = all.iter().skip(start).take(size).cloned().collect();
    (
        items,
        (start + size < all.len()).then(|| (start + size).to_string()),
    )
}

async fn list_lists(
    State(inner): Shared,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let mut g = inner.lock().unwrap();
    record(
        &mut g,
        "GET",
        "/tasks/v1/users/@me/lists",
        q.clone(),
        Value::Null,
        &headers,
    );
    if let Some(r) = tasks_gate(&mut g, &headers) {
        return r;
    }
    let all: Vec<Value> = g
        .lists
        .iter()
        .map(|(id, l)| json!({ "id": id, "title": l.title }))
        .collect();
    let (items, next) = page_of(&g, &q, &all, 1000);
    let mut body = json!({ "kind": "tasks#taskLists", "items": items });
    if let Some(next) = next {
        body["nextPageToken"] = json!(next);
    }
    Json(body).into_response()
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
    if let Some(r) = tasks_gate(&mut g, &headers) {
        return r;
    }
    let Some((_, l)) = g.lists.iter().find(|(l, _)| *l == id) else {
        return not_found();
    };
    let flag = |name: &str, default: bool| q.get(name).map_or(default, |v| v == "true");
    let (show_hidden, show_completed) = (flag("showHidden", false), flag("showCompleted", true));
    let visible: Vec<Value> = l
        .in_order()
        .iter()
        .map(|t| &l.tasks[t])
        .filter(|t| (!t.hidden || show_hidden) && (!t.completed || show_completed))
        .map(|t| json!({ "id": t.id, "title": t.title, "parent": t.parent }))
        .collect();
    let (items, next) = page_of(&g, &q, &visible, 20);
    let mut body = json!({ "kind": "tasks#tasks", "items": items });
    if let Some(next) = next {
        body["nextPageToken"] = json!(next);
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
    if let Some(r) = tasks_gate(&mut g, &headers) {
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
            completed: false,
            hidden: false,
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
    if let Some(r) = tasks_gate(&mut g, &headers) {
        return r;
    }
    let strict = g.strict_deletes;
    let Some((_, l)) = g.lists.iter_mut().find(|(l, _)| *l == id) else {
        return not_found();
    };
    if !l.tasks.contains_key(&task) {
        return not_found();
    }
    if strict
        && l.order
            .get(&Some(task.clone()))
            .is_some_and(|c| !c.is_empty())
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": { "code": 400, "message": "Task has subtasks" } })),
        )
            .into_response();
    }
    l.remove(&task);
    StatusCode::NO_CONTENT.into_response()
}
