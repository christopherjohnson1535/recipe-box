/// A broken domain rule or a failed port call. The HTTP layer maps it to a status code and an error body.
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("This needs an AI provider, and none is configured.")]
    AiDisabled,
    #[error("{0}")]
    Ai(String),
    #[error("{0}")]
    NoRecipeFound(String),
    #[error("That address is not allowed.")]
    BlockedAddress,
    #[error("{0}")]
    SiteBlocked(String),
    #[error("{0}")]
    FetchFailed(String),
    /// Infrastructure failed (database, disk). The message is for logs, never for the client.
    #[error("{0}")]
    Internal(String),
}

impl DomainError {
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }
}

pub type DomainResult<T> = Result<T, DomainError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_message_is_displayed() {
        let e = DomainError::validation("title: required");
        assert_eq!(e.to_string(), "title: required");
        assert!(matches!(e, DomainError::Validation(m) if m == "title: required"));
    }
}
