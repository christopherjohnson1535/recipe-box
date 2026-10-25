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
    /// Not signed in, or the credentials given are wrong. The message is a fixed sentence shown to the client.
    #[error("{0}")]
    Unauthenticated(&'static str),
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
    /// An upload that is not a readable image, or is over the size bounds.
    #[error("{0}")]
    UnsupportedMedia(String),
    /// A feature that is not built yet.
    #[error("{0}")]
    NotImplemented(String),
    /// Infrastructure failed (database, disk). The message is for logs, never for the client.
    #[error("{0}")]
    Internal(String),
}

impl DomainError {
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    /// `Internal` carrying the whole chain of `e` and its sources ("outer: inner: root"), so the log keeps what
    /// an `anyhow` error would have shown.
    pub fn internal(e: impl std::error::Error) -> Self {
        let mut message = e.to_string();
        let mut source = e.source();
        while let Some(s) = source {
            message.push_str(": ");
            message.push_str(&s.to_string());
            source = s.source();
        }
        Self::Internal(message)
    }
}

pub type DomainResult<T> = Result<T, DomainError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unauthenticated_message_is_displayed() {
        let e = DomainError::Unauthenticated("Wrong username or password.");
        assert_eq!(e.to_string(), "Wrong username or password.");
    }

    #[derive(Debug, thiserror::Error)]
    #[error("{label}")]
    struct Layer {
        label: &'static str,
        #[source]
        inner: Option<Box<Layer>>,
    }

    #[test]
    fn internal_keeps_the_whole_source_chain() {
        let chain = Layer {
            label: "save failed",
            inner: Some(Box::new(Layer {
                label: "query failed",
                inner: Some(Box::new(Layer {
                    label: "connection reset",
                    inner: None,
                })),
            })),
        };
        let e = DomainError::internal(chain);
        assert!(
            matches!(&e, DomainError::Internal(m) if m == "save failed: query failed: connection reset"),
            "{e:?}"
        );
    }

    #[test]
    fn internal_without_a_source_is_just_the_message() {
        let e = DomainError::internal(Layer {
            label: "disk full",
            inner: None,
        });
        assert!(matches!(e, DomainError::Internal(m) if m == "disk full"));
    }

    #[test]
    fn validation_message_is_displayed() {
        let e = DomainError::validation("title: required");
        assert_eq!(e.to_string(), "title: required");
        assert!(matches!(e, DomainError::Validation(m) if m == "title: required"));
    }
}
