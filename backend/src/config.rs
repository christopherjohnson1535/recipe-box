use std::{env, path::PathBuf};

use anyhow::{Context, bail};

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

/// A credential that never prints: `Debug` and `Display` show `[redacted]`. Read it with [`Secret::expose`].
#[derive(Clone)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[redacted]")
    }
}

impl std::fmt::Display for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[redacted]")
    }
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
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let ai_provider = var("AI_PROVIDER", "none").to_lowercase();
        if !matches!(ai_provider.as_str(), "none" | "anthropic") {
            bail!("AI_PROVIDER must be `none` or `anthropic`, got `{ai_provider}`");
        }
        let anthropic_api_key = env::var("ANTHROPIC_API_KEY")
            .ok()
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
        })
    }

    pub fn ai_enabled(&self) -> bool {
        self.ai_provider != "none"
    }

    pub fn max_upload_bytes(&self) -> usize {
        self.max_upload_mb * 1024 * 1024
    }
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
    use super::{Secret, parse_session_days};

    #[test]
    fn secret_never_prints() {
        let s = Secret::new("sk-ant-hunter2");
        assert_eq!(format!("{s:?} {s}"), "[redacted] [redacted]");
        assert_eq!(s.expose(), "sk-ant-hunter2");
    }

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
