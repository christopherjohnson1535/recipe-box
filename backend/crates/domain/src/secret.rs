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

/// Equal strings, compared in time that depends on their length only (state values, tokens).
pub fn constant_time_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0, |d, (x, y)| d | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::{Secret, constant_time_eq};

    #[test]
    fn constant_time_eq_compares_whole_strings() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "ab"));
        assert!(!constant_time_eq("", "a"));
        assert!(constant_time_eq("", ""));
    }

    #[test]
    fn secret_never_prints() {
        let s = Secret::new("sk-ant-hunter2");
        assert_eq!(format!("{s:?} {s}"), "[redacted] [redacted]");
        assert_eq!(s.expose(), "sk-ant-hunter2");
    }
}
