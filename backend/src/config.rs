use std::{env, path::PathBuf};

use anyhow::{Context, bail};

pub use domain::Secret;

/// `IMPORT_ALLOW_HOST` is for throwaway test stacks. `COOKIE_SECURE=true` is a production-looking config, so the two
/// together are refused at startup.
pub fn check_import_allow_host(allow_host: &str, cookie_secure: bool) -> anyhow::Result<()> {
    if cookie_secure && !allow_host.trim().is_empty() {
        bail!(
            "IMPORT_ALLOW_HOST is for test stacks only and must not be set together with COOKIE_SECURE=true; unset it"
        );
    }
    Ok(())
}

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub media_dir: PathBuf,
    pub bind_addr: String,
    pub cookie_secure: bool,
    pub session_days: i64,
    /// `none` or `anthropic`.
    pub ai_provider: String,
    pub anthropic_api_key: Option<Secret>,
    pub ai_model: String,
    pub max_upload_mb: usize,
    /// Largest backup archive `POST /api/import/export` takes.
    pub max_backup_mb: usize,
    /// The Google OAuth client for the Tasks export; `None` turns the feature off.
    pub google: Option<GoogleConfig>,
}

/// `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` and `TOKEN_ENCRYPTION_KEY`: all four or none.
#[derive(Clone)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: Secret,
    /// `http(s)://host[/path]` without a trailing slash.
    pub public_url: String,
    /// The decoded `TOKEN_ENCRYPTION_KEY`.
    pub token_key: [u8; 32],
}

/// `Debug` shows the address and client id only: `Config` is logged in places, and the key must never be.
impl std::fmt::Debug for GoogleConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GoogleConfig")
            .field("client_id", &self.client_id)
            .field("public_url", &self.public_url)
            .finish_non_exhaustive()
    }
}

/// The four Google settings as given (blank counts as unset). `None` when none is set; an error naming what is
/// missing when only some are, or when a value is not usable.
pub fn google_config(
    client_id: Option<String>,
    client_secret: Option<String>,
    public_url: Option<String>,
    token_key: Option<String>,
) -> anyhow::Result<Option<GoogleConfig>> {
    let trimmed = |v: Option<String>| v.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let (id, secret, url, key) = (
        trimmed(client_id),
        trimmed(client_secret),
        trimmed(public_url),
        trimmed(token_key),
    );
    let missing: Vec<&str> = [
        ("GOOGLE_CLIENT_ID", id.is_none()),
        ("GOOGLE_CLIENT_SECRET", secret.is_none()),
        ("PUBLIC_URL", url.is_none()),
        ("TOKEN_ENCRYPTION_KEY", key.is_none()),
    ]
    .into_iter()
    .filter_map(|(name, absent)| absent.then_some(name))
    .collect();
    let (Some(client_id), Some(secret), Some(url), Some(key)) = (id, secret, url, key) else {
        if missing.len() == 4 {
            return Ok(None);
        }
        bail!(
            "Google Tasks needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL and TOKEN_ENCRYPTION_KEY \
             together; missing: {}",
            missing.join(", ")
        );
    };
    let parsed = domain::url::Url::parse(&url).ok().filter(|u| {
        matches!(u.scheme(), "http" | "https")
            && u.host_str().is_some()
            && u.query().is_none()
            && u.fragment().is_none()
    });
    if parsed.is_none() {
        bail!("PUBLIC_URL must be an http(s) address such as https://recipes.example.com");
    }
    Ok(Some(GoogleConfig {
        client_id,
        client_secret: Secret::new(secret),
        public_url: url.trim_end_matches('/').to_string(),
        token_key: crate::crypto::parse_key(&key).map_err(anyhow::Error::msg)?,
    }))
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let ai_provider = var("AI_PROVIDER", "none").to_lowercase();
        if !matches!(ai_provider.as_str(), "none" | "anthropic") {
            bail!("AI_PROVIDER must be `none` or `anthropic`, got `{ai_provider}`");
        }
        let anthropic_api_key = env::var("ANTHROPIC_API_KEY")
            .ok()
            // A key pasted with a trailing newline or `\r` (Windows editors) would be an invalid header.
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .map(Secret::new);
        if ai_provider == "anthropic" && anthropic_api_key.is_none() {
            bail!("AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY");
        }
        Ok(Self {
            database_url: var("DATABASE_URL", "postgres://recipes:recipes@db:5432/recipes"),
            media_dir: var("MEDIA_DIR", "/data/media").into(),
            bind_addr: var("BIND_ADDR", "0.0.0.0:8080"),
            cookie_secure: var("COOKIE_SECURE", "false")
                .parse()
                .context("COOKIE_SECURE must be true or false")?,
            session_days: parse_session_days(&var("SESSION_DAYS", "30"))?,
            ai_provider,
            anthropic_api_key,
            ai_model: var("AI_MODEL", "claude-sonnet-5-5"),
            max_upload_mb: var("MAX_UPLOAD_MB", "15")
                .parse()
                .ok()
                .filter(|m| *m > 0)
                .context("MAX_UPLOAD_MB must be a positive number")?,
            max_backup_mb: var("MAX_BACKUP_MB", "512")
                .parse()
                .ok()
                .filter(|m| (1..=65_536).contains(m))
                .context("MAX_BACKUP_MB must be a whole number from 1 to 65536")?,
            google: google_config(
                env::var("GOOGLE_CLIENT_ID").ok(),
                env::var("GOOGLE_CLIENT_SECRET").ok(),
                env::var("PUBLIC_URL").ok(),
                env::var("TOKEN_ENCRYPTION_KEY").ok(),
            )?,
        })
    }

    pub fn max_upload_bytes(&self) -> usize {
        self.max_upload_mb * 1024 * 1024
    }

    pub fn max_backup_bytes(&self) -> usize {
        self.max_backup_mb * 1024 * 1024
    }
}

/// `TRUSTED_PROXIES`: the proxies whose `X-Forwarded-For` the sign-in rate limiter believes. Empty (the default)
/// trusts none, so the limiter sees the peer address. See docs/DEPLOY.md.
pub fn trusted_proxies(raw: &str) -> anyhow::Result<adapter_http::TrustedProxies> {
    adapter_http::TrustedProxies::parse(raw).map_err(|e| {
        anyhow::anyhow!("TRUSTED_PROXIES: {e} (use addresses or CIDR networks, comma-separated)")
    })
}

/// Whole days a session lasts. Capped so date arithmetic on it can never overflow.
fn parse_session_days(raw: &str) -> anyhow::Result<i64> {
    raw.parse()
        .ok()
        .filter(|d| (1..=3650).contains(d))
        .context("SESSION_DAYS must be a whole number from 1 to 3650")
}

fn var(name: &str, default: &str) -> String {
    env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}

#[cfg(test)]
mod tests {
    use super::parse_session_days;

    #[test]
    fn session_days_must_be_between_1_and_3650() {
        assert_eq!(parse_session_days("1").unwrap(), 1);
        assert_eq!(parse_session_days("3650").unwrap(), 3650);
        for bad in ["0", "-1", "3651", "999999999999", "abc", "1.5"] {
            let err = parse_session_days(bad).unwrap_err().to_string();
            assert!(err.contains("1 to 3650"), "{bad}: {err}");
        }
    }
}

#[cfg(test)]
mod import_allow_host_tests {
    use super::check_import_allow_host;

    #[test]
    fn refused_with_secure_cookies() {
        assert!(check_import_allow_host("fixture:4146", true).is_err());
        assert!(check_import_allow_host(" 127.0.0.1:9 ", true).is_err());
    }

    #[test]
    fn fine_when_unset_or_not_production_looking() {
        assert!(check_import_allow_host("", true).is_ok());
        assert!(check_import_allow_host("  ", true).is_ok());
        assert!(check_import_allow_host("fixture:4146", false).is_ok());
    }
}

#[cfg(test)]
mod google_tests {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    use super::google_config;

    fn key() -> Option<String> {
        Some(STANDARD.encode([5u8; 32]))
    }

    fn some(s: &str) -> Option<String> {
        Some(s.to_string())
    }

    #[test]
    fn none_set_means_google_is_off() {
        assert!(google_config(None, None, None, None).unwrap().is_none());
        assert!(
            google_config(some(""), some("  "), None, some("\n"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn all_four_turn_it_on_and_a_trailing_slash_is_dropped() {
        let g = google_config(
            some("id"),
            some("secret"),
            some("https://r.example.com/"),
            key(),
        )
        .unwrap()
        .expect("on");
        assert_eq!(g.client_id, "id");
        assert_eq!(g.client_secret.expose(), "secret");
        assert_eq!(g.public_url, "https://r.example.com");
        assert_eq!(g.token_key, [5u8; 32]);
        let local = google_config(some("id"), some("s"), some("http://localhost:3000"), key())
            .unwrap()
            .unwrap();
        assert_eq!(local.public_url, "http://localhost:3000");
    }

    #[test]
    fn some_but_not_all_names_what_is_missing() {
        let e = google_config(some("id"), None, some("https://r.example.com"), None)
            .unwrap_err()
            .to_string();
        assert!(
            e.contains("missing: GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY"),
            "{e}"
        );
        let e = google_config(None, None, some("https://r.example.com"), None)
            .unwrap_err()
            .to_string();
        assert!(
            e.contains("missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY"),
            "{e}"
        );
    }

    #[test]
    fn the_address_and_the_key_must_be_usable() {
        for bad in [
            "recipes.example.com",
            "ftp://r.example.com",
            "https://",
            "https://r.example.com/?x=1",
        ] {
            let e = google_config(some("id"), some("s"), some(bad), key()).unwrap_err();
            assert!(
                e.to_string().starts_with("PUBLIC_URL must be"),
                "{bad}: {e}"
            );
        }
        for bad in [STANDARD.encode([5u8; 16]), "%%%".to_string()] {
            let e = google_config(
                some("id"),
                some("s"),
                some("https://r.example.com"),
                Some(bad),
            )
            .unwrap_err();
            assert!(
                e.to_string().starts_with("TOKEN_ENCRYPTION_KEY must"),
                "{e}"
            );
        }
    }

    #[test]
    fn the_secrets_do_not_print() {
        let g = google_config(
            some("id"),
            some("hunter2"),
            some("https://r.example.com"),
            key(),
        )
        .unwrap()
        .unwrap();
        let shown = format!("{g:?}");
        assert!(
            !shown.contains("hunter2") && !shown.contains("5, 5"),
            "{shown}"
        );
    }
}
