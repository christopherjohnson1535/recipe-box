//! The one source of "now" for every time rule (restore window, session expiry, purge).
//!
//! Production uses [`Clock::System`]. Tests use [`Clock::fixed`] and move it with [`Clock::advance`], so edges like
//! "exactly at the window" are testable. The repositories are built with it (as a `ports::Clock`) and stamp rows
//! with it; nothing calls the database's `now()`.

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Utc};

#[derive(Clone, Debug, Default)]
pub enum Clock {
    #[default]
    System,
    /// A clock that only moves when told to. Clones share the same time.
    Fixed(Arc<Mutex<DateTime<Utc>>>),
}

impl Clock {
    pub fn fixed(at: DateTime<Utc>) -> Self {
        Self::Fixed(Arc::new(Mutex::new(at)))
    }

    pub fn now(&self) -> DateTime<Utc> {
        match self {
            Self::System => Utc::now(),
            Self::Fixed(t) => *t.lock().expect("clock lock"),
        }
    }

    /// Moves a fixed clock forward (or back, with a negative duration). Panics on the system clock: that is a
    /// test bug, not something to ignore.
    pub fn advance(&self, by: Duration) {
        match self {
            Self::System => panic!("Clock::advance on the system clock"),
            Self::Fixed(t) => {
                let mut t = t.lock().expect("clock lock");
                *t += by;
            }
        }
    }
}

impl ports::Clock for Clock {
    fn now(&self) -> DateTime<Utc> {
        Clock::now(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_clock_moves_only_when_told_and_clones_share_time() {
        let at = DateTime::parse_from_rfc3339("2026-01-02T03:04:05Z")
            .unwrap()
            .to_utc();
        let a = Clock::fixed(at);
        let b = a.clone();
        assert_eq!(a.now(), at);
        b.advance(Duration::milliseconds(1500));
        assert_eq!(a.now(), at + Duration::milliseconds(1500));
    }
}
