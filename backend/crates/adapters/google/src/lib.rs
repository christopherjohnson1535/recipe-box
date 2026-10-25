//! Google sign-in and the Google Tasks API as a [`ports::GoogleTasks`] (GRO-5).
//!
//! [`GoogleTasksClient`] runs the OAuth web-server flow (consent URL, code exchange, refresh, revoke) and replaces
//! the contents of a task list. Tokens are [`Secret`]s: they travel in request bodies and `Authorization` headers
//! only, never in a URL, a log line or an error. Every call has a 10 s timeout. A throttled call (429, or 403 with a
//! rate-limit reason) is repeated up to three times in all, after `Retry-After` (at most 10 s) or a growing pause;
//! reading and deleting tasks is also repeated after a 5xx or a lost connection, but making a task is not (a repeated
//! POST that Google did process would add the task twice). A send that still fails leaves the list partly filled and
//! the next send starts by emptying it. Google's own error text is logged, trimmed, without any request data.

use std::time::Duration;

use async_trait::async_trait;
use domain::{DomainError, DomainResult, Secret, url::Url};
use ports::{GoogleTasks, TaskSection};
use reqwest::{RequestBuilder, Response, StatusCode};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const TASKS_URL: &str = "https://tasks.googleapis.com/tasks/v1";
const SCOPE: &str = "https://www.googleapis.com/auth/tasks";
/// Where Google sends the browser back, below `PUBLIC_URL`.
pub const CALLBACK_PATH: &str = "/api/integrations/google/callback";
const CALL_TIMEOUT: Duration = Duration::from_secs(10);
/// Tries per call, the first included.
const ATTEMPTS: u32 = 3;
/// Longest `Retry-After` that is waited out.
const MAX_WAIT: Duration = Duration::from_secs(10);
/// The pause before the second try; the third waits twice as long. `Retry-After` takes its place when sent.
const BACKOFF: Duration = Duration::from_millis(500);
/// How long filling a list may take in all. The service's export lease runs out only after this.
const FILL_DEADLINE: Duration = Duration::from_secs(100);
/// Said when a send fails after the list was touched.
const INCOMPLETE: &str = "The list in Google Tasks may be incomplete; send it again.";
/// Tasks per page asked for (Google's maximum).
const PAGE_SIZE: &str = "100";
/// A task list holds at most 20,000 tasks, so more pages than this means Google keeps repeating itself.
const MAX_PAGES: usize = 250;
/// Longest piece of Google's own error text that is logged.
const MAX_LOGGED: usize = 300;

/// The four Google hosts. Production uses [`GoogleUrls::default`]; tests point them at a local stub.
#[derive(Debug, Clone)]
pub struct GoogleUrls {
    pub auth: String,
    pub token: String,
    pub revoke: String,
    /// The Tasks API root, without a trailing slash (`https://tasks.googleapis.com/tasks/v1`).
    pub tasks: String,
}

impl Default for GoogleUrls {
    fn default() -> Self {
        Self {
            auth: AUTH_URL.into(),
            token: TOKEN_URL.into(),
            revoke: REVOKE_URL.into(),
            tasks: TASKS_URL.into(),
        }
    }
}

pub struct GoogleTasksClient {
    http: reqwest::Client,
    client_id: String,
    client_secret: Secret,
    redirect_uri: String,
    urls: GoogleUrls,
    backoff: Duration,
    fill_deadline: Duration,
}

impl GoogleTasksClient {
    /// `public_url` is the address people use to reach the site, without a trailing slash.
    pub fn new(client_id: String, client_secret: Secret, public_url: &str) -> anyhow::Result<Self> {
        Self::with_base_urls(client_id, client_secret, public_url, GoogleUrls::default())
    }

    /// Like [`GoogleTasksClient::new`] with other hosts; tests point them at a local stub.
    pub fn with_base_urls(
        client_id: String,
        client_secret: Secret,
        public_url: &str,
        urls: GoogleUrls,
    ) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(CALL_TIMEOUT)
            .timeout(CALL_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("RecipeBox/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            client_id,
            client_secret,
            redirect_uri: format!("{}{CALLBACK_PATH}", public_url.trim_end_matches('/')),
            urls: GoogleUrls {
                tasks: urls.tasks.trim_end_matches('/').to_string(),
                ..urls
            },
            backoff: BACKOFF,
            fill_deadline: FILL_DEADLINE,
        })
    }

    /// Other pauses between tries and another limit for filling a list; tests make them short.
    pub fn with_timing(mut self, backoff: Duration, fill_deadline: Duration) -> Self {
        self.backoff = backoff;
        self.fill_deadline = fill_deadline;
        self
    }

    /// `POST` of a form to the token or revoke endpoint.
    async fn form(&self, url: &str, fields: &[(&str, &str)]) -> DomainResult<Response> {
        send(self.http.post(url).form(fields)).await
    }

    /// The Tasks API URL for the path `segments` (each one percent-encoded) and `query`.
    fn tasks_url(&self, segments: &[&str], query: &[(&str, &str)]) -> DomainResult<Url> {
        let mut url = Url::parse(&self.urls.tasks).map_err(|_| unreadable())?;
        url.path_segments_mut()
            .map_err(|_| unreadable())?
            .pop_if_empty()
            .extend(segments);
        if !query.is_empty() {
            url.query_pairs_mut().extend_pairs(query);
        }
        Ok(url)
    }

    fn api(&self, method: reqwest::Method, url: Url, access: &Secret) -> RequestBuilder {
        self.http.request(method, url).bearer_auth(access.expose())
    }

    /// Sends the request, repeating it when `replay` allows and Google throttled it (or, for `Idempotent`, failed
    /// on its side or could not be reached). Returns the last answer; a 403 that is not about rate limits is
    /// already an error.
    async fn call(&self, req: RequestBuilder, replay: Replay) -> DomainResult<Response> {
        let mut pause = self.backoff;
        for attempt in 1..=ATTEMPTS {
            let last = attempt == ATTEMPTS;
            let again = req.try_clone().ok_or_else(unreadable)?;
            let res = match again.send().await {
                Ok(res) => res,
                Err(e)
                    if replay == Replay::Idempotent
                        && !last
                        && (e.is_connect() || e.is_timeout()) =>
                {
                    tokio::time::sleep(pause).await;
                    pause *= 2;
                    continue;
                }
                Err(e) => return Err(unreachable_google(&e)),
            };
            let status = res.status();
            let wait = if status == StatusCode::TOO_MANY_REQUESTS {
                Some(retry_after(&res).unwrap_or(pause))
            } else if status == StatusCode::FORBIDDEN {
                let asked = retry_after(&res);
                let body = res.text().await.unwrap_or_default();
                if last || !rate_limited(&body) {
                    return Err(refused(status, &body));
                }
                tokio::time::sleep(asked.unwrap_or(pause)).await;
                pause *= 2;
                continue;
            } else if status.is_server_error() && replay == Replay::Idempotent {
                Some(pause)
            } else {
                None
            };
            match wait {
                Some(w) if !last => {
                    tokio::time::sleep(w).await;
                    pause *= 2;
                }
                _ => return Ok(res),
            }
        }
        Err(unreadable())
    }

    /// Makes a task and returns its id. `parent` and `previous` place it among its siblings.
    async fn insert(
        &self,
        access: &Secret,
        list: &str,
        title: &str,
        parent: Option<&str>,
        previous: Option<&str>,
    ) -> DomainResult<String> {
        let query: Vec<(&str, &str)> = parent
            .map(|p| ("parent", p))
            .into_iter()
            .chain(previous.map(|p| ("previous", p)))
            .collect();
        let url = self.tasks_url(&["lists", list, "tasks"], &query)?;
        let req = self
            .api(reqwest::Method::POST, url, access)
            .json(&json!({ "title": title }));
        Ok(read::<Created>(self.call(req, Replay::Throttled).await?)
            .await?
            .id)
    }

    /// Every task of the list, completed and hidden ones too.
    async fn tasks(&self, access: &Secret, list: &str) -> DomainResult<Vec<Task>> {
        let mut tasks = Vec::new();
        let mut token: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut query = vec![
                ("showHidden", "true"),
                ("showCompleted", "true"),
                ("maxResults", PAGE_SIZE),
            ];
            if let Some(t) = &token {
                query.push(("pageToken", t));
            }
            let url = self.tasks_url(&["lists", list, "tasks"], &query)?;
            let req = self.api(reqwest::Method::GET, url, access);
            let page: Page<Task> = read(self.call(req, Replay::Idempotent).await?).await?;
            tasks.extend(page.items);
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(next) => token = Some(next),
                None => return Ok(tasks),
            }
        }
        Err(unreadable())
    }

    /// The id of the first of the member's task lists called exactly `title`.
    async fn list_titled(&self, access: &Secret, title: &str) -> DomainResult<Option<String>> {
        let mut token: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut query = vec![("maxResults", PAGE_SIZE)];
            if let Some(t) = &token {
                query.push(("pageToken", t));
            }
            let url = self.tasks_url(&["users", "@me", "lists"], &query)?;
            let req = self.api(reqwest::Method::GET, url, access);
            let page: Page<TaskList> = read(self.call(req, Replay::Idempotent).await?).await?;
            if let Some(found) = page.items.into_iter().find(|l| l.title == title) {
                return Ok(Some(found.id));
            }
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(next) => token = Some(next),
                None => return Ok(None),
            }
        }
        Err(unreadable())
    }

    /// Empties the list, then makes the sections and their items.
    async fn rewrite(
        &self,
        access: &Secret,
        list: &str,
        sections: &[TaskSection],
    ) -> DomainResult<()> {
        // Whether deleting a task takes its subtasks along is not documented, so subtasks go first, and a task that
        // is already gone is fine.
        let (subtasks, top): (Vec<Task>, Vec<Task>) = self
            .tasks(access, list)
            .await?
            .into_iter()
            .partition(|t| t.parent.is_some());
        for task in subtasks.iter().chain(&top) {
            let url = self.tasks_url(&["lists", list, "tasks", &task.id], &[])?;
            let res = self
                .call(
                    self.api(reqwest::Method::DELETE, url, access),
                    Replay::Idempotent,
                )
                .await?;
            if !res.status().is_success()
                && !matches!(res.status(), StatusCode::NOT_FOUND | StatusCode::GONE)
            {
                return Err(failed(res).await);
            }
        }

        // A task made without `previous` goes first among its siblings, so each one names the one before it.
        let mut previous_section: Option<String> = None;
        for section in sections {
            let parent = self
                .insert(
                    access,
                    list,
                    &section.title,
                    None,
                    previous_section.as_deref(),
                )
                .await?;
            let mut previous_item: Option<String> = None;
            for item in &section.items {
                previous_item = Some(
                    self.insert(access, list, item, Some(&parent), previous_item.as_deref())
                        .await?,
                );
            }
            previous_section = Some(parent);
        }
        Ok(())
    }
}

/// What a call may repeat after a failure.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Replay {
    /// Reading and deleting: repeating changes nothing, so server errors and lost connections are retried too.
    Idempotent,
    /// Making things: only a throttled request is repeated, because Google did not act on it.
    Throttled,
}

#[derive(Deserialize)]
struct Created {
    id: String,
}

/// A task as listed: a subtask names its parent.
#[derive(Deserialize)]
struct Task {
    id: String,
    parent: Option<String>,
}

#[derive(Deserialize)]
struct TaskList {
    id: String,
    #[serde(default)]
    title: String,
}

/// One page of a listing.
#[derive(Deserialize)]
struct Page<T> {
    #[serde(default = "Vec::new")]
    items: Vec<T>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenReply {
    access_token: Option<String>,
    refresh_token: Option<String>,
    /// The scopes granted, separated by spaces.
    scope: Option<String>,
}

fn unreadable() -> DomainError {
    DomainError::Google("Google sent a reply we could not read.".into())
}

/// A failure to get any answer, as a fixed sentence: the error text could carry the URL.
fn unreachable_google(e: &reqwest::Error) -> DomainError {
    DomainError::Google(if e.is_timeout() {
        "Google took too long to answer.".into()
    } else {
        "Could not reach Google.".into()
    })
}

async fn send(req: RequestBuilder) -> DomainResult<Response> {
    req.send().await.map_err(|e| unreachable_google(&e))
}

/// Google's error answer as a `Google` error; what Google said (status and message) is logged, trimmed.
async fn failed(res: Response) -> DomainError {
    let status = res.status();
    refused(status, &res.text().await.unwrap_or_default())
}

fn refused(status: StatusCode, body: &str) -> DomainError {
    let said = match serde_json::from_str::<Value>(body) {
        Ok(v) => v["error"]["message"]
            .as_str()
            .or_else(|| v["error_description"].as_str())
            .or_else(|| v["error"].as_str())
            .unwrap_or_default()
            .chars()
            .take(MAX_LOGGED)
            .collect::<String>(),
        Err(_) => String::new(),
    };
    tracing::warn!(%status, said = %said, "Google answered with an error");
    DomainError::Google(format!("Google refused the request ({}).", status.as_u16()))
}

/// Whether a 403 body says "slow down" (`rateLimitExceeded`, `userRateLimitExceeded`) and not "no".
fn rate_limited(body: &str) -> bool {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    v["error"]["errors"].as_array().is_some_and(|errors| {
        errors.iter().any(|e| {
            matches!(
                e["reason"].as_str(),
                Some("rateLimitExceeded" | "userRateLimitExceeded")
            )
        })
    })
}

/// The `Retry-After` of an answer in seconds (the date form is not used by Google's APIs), at most [`MAX_WAIT`].
fn retry_after(res: &Response) -> Option<Duration> {
    let secs: u64 = res
        .headers()
        .get("retry-after")?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()?;
    Some(Duration::from_secs(secs).min(MAX_WAIT))
}

/// The JSON body of a successful answer; anything else is an error.
async fn read<T: DeserializeOwned>(res: Response) -> DomainResult<T> {
    if !res.status().is_success() {
        return Err(failed(res).await);
    }
    res.json().await.map_err(|_| unreadable())
}

/// Whether a failed token answer says the refresh token is dead (`invalid_grant`): revoked, expired or removed.
async fn is_invalid_grant(res: Response) -> bool {
    let status = res.status();
    let body: Value = res.json().await.unwrap_or(Value::Null);
    let dead = body["error"].as_str() == Some("invalid_grant");
    if !dead {
        tracing::warn!(%status, error = body["error"].as_str().unwrap_or(""), "Google refused to refresh a token");
    }
    dead
}

#[async_trait]
impl GoogleTasks for GoogleTasksClient {
    fn configured(&self) -> bool {
        true
    }

    fn consent_url(&self, state: &str) -> DomainResult<Url> {
        let mut url = Url::parse(&self.urls.auth).map_err(|_| unreadable())?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", SCOPE)
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .append_pair("include_granted_scopes", "true")
            .append_pair("state", state);
        Ok(url)
    }

    async fn exchange_code(&self, code: &str) -> DomainResult<Secret> {
        let res = self
            .form(
                &self.urls.token,
                &[
                    ("code", code),
                    ("client_id", &self.client_id),
                    ("client_secret", self.client_secret.expose()),
                    ("redirect_uri", &self.redirect_uri),
                    ("grant_type", "authorization_code"),
                ],
            )
            .await?;
        let reply: TokenReply = read(res).await?;
        if reply
            .scope
            .as_deref()
            .is_some_and(|granted| !granted.split_whitespace().any(|s| s == SCOPE))
        {
            return Err(DomainError::Google(
                "Google did not grant access to Google Tasks.".into(),
            ));
        }
        match reply.refresh_token.filter(|t| !t.is_empty()) {
            Some(t) => Ok(Secret::new(t)),
            None => Err(DomainError::Google(
                "Google did not hand over a refresh token.".into(),
            )),
        }
    }

    async fn access_token(&self, refresh: &Secret) -> DomainResult<Secret> {
        let res = self
            .form(
                &self.urls.token,
                &[
                    ("refresh_token", refresh.expose()),
                    ("client_id", &self.client_id),
                    ("client_secret", self.client_secret.expose()),
                    ("grant_type", "refresh_token"),
                ],
            )
            .await?;
        if matches!(
            res.status(),
            StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED
        ) {
            return if is_invalid_grant(res).await {
                Err(DomainError::GoogleNotConnected)
            } else {
                Err(DomainError::Google("Google refused the request.".into()))
            };
        }
        let reply: TokenReply = read(res).await?;
        reply
            .access_token
            .filter(|t| !t.is_empty())
            .map(Secret::new)
            .ok_or_else(unreadable)
    }

    async fn revoke(&self, token: &Secret) -> DomainResult<()> {
        let res = self
            .form(&self.urls.revoke, &[("token", token.expose())])
            .await?;
        if res.status().is_success() {
            Ok(())
        } else {
            Err(failed(res).await)
        }
    }

    async fn ensure_list(
        &self,
        access: &Secret,
        tasklist_id: Option<&str>,
        title: &str,
    ) -> DomainResult<String> {
        if let Some(id) = tasklist_id {
            let url = self.tasks_url(&["users", "@me", "lists", id], &[])?;
            let res = self
                .call(
                    self.api(reqwest::Method::GET, url, access),
                    Replay::Idempotent,
                )
                .await?;
            match res.status() {
                s if s.is_success() => return Ok(read::<Created>(res).await?.id),
                StatusCode::NOT_FOUND => {}
                _ => return Err(failed(res).await),
            }
        }
        // No list remembered, or Google no longer has it: a list the member already has under this name is the
        // one (a reconnect or a restored backup must not make a second `Groceries`).
        if let Some(id) = self.list_titled(access, title).await? {
            return Ok(id);
        }
        let url = self.tasks_url(&["users", "@me", "lists"], &[])?;
        let req = self
            .api(reqwest::Method::POST, url, access)
            .json(&json!({ "title": title }));
        Ok(read::<Created>(self.call(req, Replay::Throttled).await?)
            .await?
            .id)
    }

    async fn fill_list(
        &self,
        access: &Secret,
        tasklist_id: &str,
        sections: &[TaskSection],
    ) -> DomainResult<()> {
        let done = tokio::time::timeout(
            self.fill_deadline,
            self.rewrite(access, tasklist_id, sections),
        )
        .await
        .unwrap_or_else(|_| {
            Err(DomainError::Google(
                "Google took too long to answer.".into(),
            ))
        });
        // Whatever stopped it, the list may be half done.
        done.map_err(|e| match e {
            DomainError::Google(m) => DomainError::Google(format!("{m} {INCOMPLETE}")),
            other => other,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> GoogleTasksClient {
        GoogleTasksClient::new(
            "the-id".into(),
            Secret::new("the-secret"),
            "https://r.example/",
        )
        .unwrap()
    }

    #[test]
    fn the_consent_url_asks_for_offline_tasks_access_with_the_state() {
        let url = client().consent_url("st&te=1").unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://accounts.google.com"
        );
        assert_eq!(url.path(), "/o/oauth2/v2/auth");
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        for (k, v) in [
            ("client_id", "the-id"),
            (
                "redirect_uri",
                "https://r.example/api/integrations/google/callback",
            ),
            ("response_type", "code"),
            ("scope", "https://www.googleapis.com/auth/tasks"),
            ("access_type", "offline"),
            ("prompt", "consent"),
            ("include_granted_scopes", "true"),
            ("state", "st&te=1"),
        ] {
            assert_eq!(q.get(k).map(String::as_str), Some(v), "{k}");
        }
        assert_eq!(q.len(), 8);
        assert!(!url.as_str().contains("the-secret"));
    }

    #[test]
    fn task_urls_encode_ids_as_one_path_segment() {
        let url = client()
            .tasks_url(&["lists", "a/b c", "tasks"], &[("parent", "x y")])
            .unwrap();
        assert_eq!(
            url.as_str(),
            "https://tasks.googleapis.com/tasks/v1/lists/a%2Fb%20c/tasks?parent=x+y"
        );
    }
}
