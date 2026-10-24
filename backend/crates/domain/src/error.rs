/// A broken domain rule. The HTTP layer maps it to a status code and an error body.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
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
