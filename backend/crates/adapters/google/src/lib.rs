//! Google sign-in and the Google Tasks API as a [`ports::GoogleTasks`] (GRO-5).
//!
//! [`GoogleTasksClient`] runs the OAuth web-server flow (consent URL, code exchange, refresh, revoke) and replaces
//! the contents of a task list. Tokens are [`Secret`]s: they travel in request bodies and `Authorization` headers
//! only, never in a URL, a log line or an error. Every call has a 10 s timeout and nothing is retried (a repeated
//! POST would add tasks twice). Google's own error text is logged, trimmed, without any request data.

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
        })
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
        Ok(read::<Created>(send(req).await?).await?.id)
    }

    /// The ids of every task of the list, completed and hidden ones too.
    async fn task_ids(&self, access: &Secret, list: &str) -> DomainResult<Vec<String>> {
        let mut ids = Vec::new();
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
            let page: TaskPage =
                read(send(self.api(reqwest::Method::GET, url, access)).await?).await?;
            ids.extend(page.items.into_iter().map(|t| t.id));
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(next) => token = Some(next),
                None => return Ok(ids),
            }
        }
        Err(unreadable())
    }

    /// The list to fill: the one `known` names if Google still has it, else a new one.
    async fn list_to_fill(
        &self,
        access: &Secret,
        known: Option<&str>,
        title: &str,
    ) -> DomainResult<String> {
        if let Some(id) = known {
            let url = self.tasks_url(&["users", "@me", "lists", id], &[])?;
            let res = send(self.api(reqwest::Method::GET, url, access)).await?;
            match res.status() {
                s if s.is_success() => return Ok(read::<Created>(res).await?.id),
                StatusCode::NOT_FOUND => {}
                _ => return Err(failed(res).await),
            }
        }
        let url = self.tasks_url(&["users", "@me", "lists"], &[])?;
        let req = self
            .api(reqwest::Method::POST, url, access)
            .json(&json!({ "title": title }));
        Ok(read::<Created>(send(req).await?).await?.id)
    }
}

#[derive(Deserialize)]
struct Created {
    id: String,
}

#[derive(Deserialize)]
struct TaskPage {
    #[serde(default)]
    items: Vec<Created>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenReply {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

fn unreadable() -> DomainError {
    DomainError::Google("Google sent a reply we could not read.".into())
}

/// Sends the request. A failure to get any answer is a fixed sentence: the error text could carry the URL.
async fn send(req: RequestBuilder) -> DomainResult<Response> {
    req.send().await.map_err(|e| {
        DomainError::Google(if e.is_timeout() {
            "Google took too long to answer.".into()
        } else {
            "Could not reach Google.".into()
        })
    })
}

/// Google's error answer as a `Google` error; what Google said (status and message) is logged, trimmed.
async fn failed(res: Response) -> DomainError {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let said = match serde_json::from_str::<Value>(&body) {
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

    async fn replace_list(
        &self,
        access: &Secret,
        tasklist_id: Option<&str>,
        title: &str,
        sections: &[TaskSection],
    ) -> DomainResult<String> {
        let list = self.list_to_fill(access, tasklist_id, title).await?;

        // Deleting a parent may take its subtasks with it, so a task that is already gone is fine.
        for id in self.task_ids(access, &list).await? {
            let url = self.tasks_url(&["lists", &list, "tasks", &id], &[])?;
            let res = send(self.api(reqwest::Method::DELETE, url, access)).await?;
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
                    &list,
                    &section.title,
                    None,
                    previous_section.as_deref(),
                )
                .await?;
            let mut previous_item: Option<String> = None;
            for item in &section.items {
                previous_item = Some(
                    self.insert(access, &list, item, Some(&parent), previous_item.as_deref())
                        .await?,
                );
            }
            previous_section = Some(parent);
        }
        Ok(list)
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
