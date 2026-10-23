use std::{env, path::PathBuf};

use anyhow::{Context, bail};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub media_dir: PathBuf,
    pub bind_addr: String,
    pub cookie_secure: bool,
    pub session_days: i64,
    /// `none` or `anthropic`.
    pub ai_provider: String,
    pub anthropic_api_key: Option<String>,
    pub ai_model: String,
    pub max_upload_mb: usize,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let ai_provider = var("AI_PROVIDER", "none").to_lowercase();
        if !matches!(ai_provider.as_str(), "none" | "anthropic") {
            bail!("AI_PROVIDER must be `none` or `anthropic`, got `{ai_provider}`");
        }
        let anthropic_api_key = env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.is_empty());
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
