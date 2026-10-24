/// A broken domain rule. The HTTP layer maps it to a status code and an error body.
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("{0}")]
    Validation(String),
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
