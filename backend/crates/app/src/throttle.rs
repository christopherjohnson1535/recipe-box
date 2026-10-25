//! Slows down password guessing (ACC-1, ACC-3 hardening, issue #33).
//!
//! Every password check first calls [`Throttle::begin`]. It counts the attempt up front (so parallel requests
//! cannot all slip through before the first failure is recorded) and refuses with the wait left while a key is
//! locked. A correct password calls [`Attempt::succeed`], which gives the count back. A refused request does no
//! hashing and does not count again, so hammering a locked key does not lengthen the lock.
//!
//! Two keys are counted per attempt: the name (sign-in: the submitted username, whether or not it exists, so the
//! answer is no existence oracle; password change: the user id) and the client address. After `free` wrong
//! attempts in a row the key locks for `BASE_SECS`, doubling with every further wrong attempt up to `MAX_SECS`.
//! A key nobody touched for `FORGET_SECS` after its lock ended starts over.
//!
//! shortcut: the counts live in this process only. A restart clears them, which is fine for one household on one
//! API container; a second API instance would need a shared store (move this behind a port then).

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex, MutexGuard},
};

use domain::chrono::{DateTime, Duration, Utc};

/// Wrong attempts per username (or per user id) before the first lock.
pub const FREE_PER_NAME: u32 = 5;
/// Wrong attempts per client address before the first lock. Higher than the name limit because one address can
/// be a whole household (or, behind a proxy that hides clients, everybody) and a lock here blocks them all.
pub const FREE_PER_ADDRESS: u32 = 20;
/// The first lock lasts this long; each further wrong attempt doubles it.
pub const BASE_SECS: i64 = 30;
/// No lock lasts longer than this (15 minutes).
pub const MAX_SECS: i64 = 15 * 60;
/// A key is forgotten this long after its lock ended (or its last attempt, if it never locked).
pub const FORGET_SECS: i64 = 15 * 60;
/// Most keys remembered. Past it, expired keys go first, then the least recently used.
const MAX_KEYS: usize = 10_000;
/// Longest username kept in a key; longer ones are cut (they cannot exist, `validate::username` caps it).
const MAX_NAME_CHARS: usize = 128;

/// What is being guessed. Counts of one scope never touch another's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Scope {
    /// `POST /api/auth/login`, keyed by the submitted username.
    SignIn,
    /// `PUT /api/users/:id/password` with a `currentPassword`, keyed by the user id.
    PasswordChange,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Subject {
    Name(String),
    Address(String),
}

type Key = (Scope, Subject);

#[derive(Debug, Clone)]
struct Entry {
    wrong: u32,
    locked_until: DateTime<Utc>,
    last: DateTime<Utc>,
}

impl Entry {
    fn forgotten(&self, now: DateTime<Utc>) -> bool {
        now >= self.locked_until.max(self.last) + Duration::seconds(FORGET_SECS)
    }
}

/// The in-memory limiter. Cheap to share: keep one in an `Arc` for the whole process.
#[derive(Debug, Default)]
pub struct Throttle {
    keys: Mutex<HashMap<Key, Entry>>,
}

/// One counted attempt, to be settled with [`Attempt::succeed`] when the password was right. Dropping it without
/// that leaves the attempt counted as wrong.
#[must_use = "call succeed() when the password was right"]
pub struct Attempt {
    throttle: Arc<Throttle>,
    scope: Scope,
    name: Subject,
    address: Option<Subject>,
}

impl Throttle {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Counts an attempt, or refuses it with the whole seconds to wait (at least 1).
    ///
    /// `name` is the username as submitted (any case, any spelling: unknown names are counted exactly like known
    /// ones) or a user id; `client` is the caller's address, if it is known.
    pub fn begin(
        self: &Arc<Self>,
        now: DateTime<Utc>,
        scope: Scope,
        name: &str,
        client: Option<IpAddr>,
    ) -> Result<Attempt, u64> {
        let name = Subject::Name(normalize(name));
        let address = client.map(|ip| Subject::Address(address_key(ip)));
        let mut keys = self.lock();
        evict(&mut keys, now);

        let wait = [Some(&name), address.as_ref()]
            .into_iter()
            .flatten()
            .filter_map(|s| keys.get(&(scope, s.clone())))
            .map(|e| (e.locked_until - now).num_milliseconds())
            .max()
            .unwrap_or(0);
        if wait > 0 {
            return Err(u64::try_from((wait + 999) / 1000).unwrap_or(1).max(1));
        }

        for (subject, free) in [
            (Some(&name), FREE_PER_NAME),
            (address.as_ref(), FREE_PER_ADDRESS),
        ] {
            let Some(subject) = subject else { continue };
            let e = keys.entry((scope, subject.clone())).or_insert(Entry {
                wrong: 0,
                locked_until: now,
                last: now,
            });
            if e.forgotten(now) {
                e.wrong = 0;
            }
            e.wrong = e.wrong.saturating_add(1);
            e.last = now;
            if e.wrong >= free {
                e.locked_until = now + Duration::seconds(lock_secs(e.wrong - free));
            }
        }
        Ok(Attempt {
            throttle: self.clone(),
            scope,
            name,
            address,
        })
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<Key, Entry>> {
        // A panic while holding the lock leaves plain counters behind; they are still usable.
        self.keys.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Attempt {
    /// The password was right: the name starts over; the address only gets this one attempt back, so signing in
    /// to your own account between guesses at another does not wipe the address's count.
    pub fn succeed(self) {
        let mut keys = self.throttle.lock();
        keys.remove(&(self.scope, self.name.clone()));
        if let Some(address) = self.address {
            let key = (self.scope, address);
            if let Some(e) = keys.get_mut(&key) {
                e.wrong = e.wrong.saturating_sub(1);
                if e.wrong == 0 {
                    keys.remove(&key);
                } else if e.wrong < FREE_PER_ADDRESS {
                    e.locked_until = e.last;
                }
            }
        }
    }
}

/// Seconds of lock after `over` attempts past the free ones: 30, 60, 120, ... up to 15 minutes.
fn lock_secs(over: u32) -> i64 {
    (BASE_SECS << over.min(10)).min(MAX_SECS)
}

/// The same name spelled differently (case, surrounding spaces) is one key, as the user lookup is.
fn normalize(name: &str) -> String {
    name.trim()
        .chars()
        .take(MAX_NAME_CHARS)
        .collect::<String>()
        .to_lowercase()
}

/// An IPv4 address as is; an IPv6 one by its /64, because a single customer gets a whole /64 and could otherwise
/// walk through it to dodge the limit.
fn address_key(ip: IpAddr) -> String {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => {
            let o = v6.octets();
            let prefix = std::net::Ipv6Addr::from([
                o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], 0, 0, 0, 0, 0, 0, 0, 0,
            ]);
            format!("{prefix}/64")
        }
    }
}

/// Keeps the map bounded: drops forgotten keys, and if it is still full the least recently used ones.
fn evict(keys: &mut HashMap<Key, Entry>, now: DateTime<Utc>) {
    if keys.len() < MAX_KEYS {
        return;
    }
    keys.retain(|_, e| !e.forgotten(now));
    if keys.len() < MAX_KEYS {
        return;
    }
    let mut by_age: Vec<_> = keys.iter().map(|(k, e)| (e.last, k.clone())).collect();
    by_age.sort_by_key(|(last, _)| *last);
    for (_, k) in by_age.into_iter().take(MAX_KEYS / 10) {
        keys.remove(&k);
    }
}

#[cfg(test)]
mod tests {
    use domain::chrono::TimeZone;

    use super::*;

    fn t0() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 15, 12, 0, 0).unwrap()
    }

    fn secs(s: i64) -> Duration {
        Duration::seconds(s)
    }

    const A: IpAddr = IpAddr::V4(std::net::Ipv4Addr::new(192, 0, 2, 1));

    /// Fails `n` attempts in a row at `now` (each one begun and dropped).
    fn fail(t: &Arc<Throttle>, now: DateTime<Utc>, name: &str, n: u32) {
        for i in 0..n {
            let r = t.begin(now, Scope::SignIn, name, None);
            assert!(r.is_ok(), "attempt {} of {n} was refused", i + 1);
        }
    }

    #[test]
    fn the_sixth_wrong_attempt_is_refused_and_the_lock_doubles() {
        let t = Throttle::new();
        fail(&t, t0(), "ann", 5);
        assert_eq!(t.begin(t0(), Scope::SignIn, "ann", None).err(), Some(30));
        // Still locked 29 s later, with 1 s left; refused attempts do not extend it.
        assert_eq!(
            t.begin(t0() + secs(29), Scope::SignIn, "ann", None).err(),
            Some(1)
        );
        // Free again at 30 s; one more wrong attempt locks for 60 s, the next for 120 s.
        let now = t0() + secs(30);
        fail(&t, now, "ann", 1);
        assert_eq!(t.begin(now, Scope::SignIn, "ann", None).err(), Some(60));
        let now = now + secs(60);
        fail(&t, now, "ann", 1);
        assert_eq!(t.begin(now, Scope::SignIn, "ann", None).err(), Some(120));
    }

    #[test]
    fn the_lock_never_exceeds_fifteen_minutes() {
        let t = Throttle::new();
        let mut now = t0();
        fail(&t, now, "ann", 5);
        for _ in 0..30 {
            let wait = t.begin(now, Scope::SignIn, "ann", None).err().unwrap();
            assert!(wait <= 900, "{wait}");
            now += secs(wait as i64);
            fail(&t, now, "ann", 1);
        }
        assert_eq!(t.begin(now, Scope::SignIn, "ann", None).err(), Some(900));
    }

    #[test]
    fn success_resets_the_name() {
        let t = Throttle::new();
        fail(&t, t0(), "ann", 4);
        t.begin(t0(), Scope::SignIn, "ann", None).unwrap().succeed();
        // The count started over: four more wrong attempts are still allowed, the fifth locks.
        fail(&t, t0(), "ann", 5);
        assert!(t.begin(t0(), Scope::SignIn, "ann", None).is_err());
    }

    #[test]
    fn names_are_case_and_space_insensitive_and_unknown_names_count_the_same() {
        let t = Throttle::new();
        fail(&t, t0(), "Ann", 3);
        fail(&t, t0(), "  ANN ", 2);
        assert!(t.begin(t0(), Scope::SignIn, "ann", None).is_err());
        // A name nobody has is throttled exactly alike.
        fail(&t, t0(), "no-such-user", 5);
        assert!(t.begin(t0(), Scope::SignIn, "no-such-user", None).is_err());
        // Other names are untouched.
        assert!(t.begin(t0(), Scope::SignIn, "bob", None).is_ok());
    }

    #[test]
    fn scopes_do_not_share_counts() {
        let t = Throttle::new();
        fail(&t, t0(), "x", 5);
        assert!(t.begin(t0(), Scope::SignIn, "x", None).is_err());
        assert!(t.begin(t0(), Scope::PasswordChange, "x", None).is_ok());
    }

    #[test]
    fn one_address_guessing_many_names_is_locked_after_twenty() {
        let t = Throttle::new();
        for i in 0..FREE_PER_ADDRESS {
            assert!(
                t.begin(t0(), Scope::SignIn, &format!("user{i}"), Some(A))
                    .is_ok()
            );
        }
        assert_eq!(
            t.begin(t0(), Scope::SignIn, "fresh", Some(A)).err(),
            Some(30)
        );
        // Another address is fine, and so is the same name from there.
        let b = IpAddr::from([192, 0, 2, 2]);
        assert!(t.begin(t0(), Scope::SignIn, "fresh", Some(b)).is_ok());
    }

    #[test]
    fn a_locked_name_blocks_every_address() {
        let t = Throttle::new();
        for _ in 0..5 {
            assert!(t.begin(t0(), Scope::SignIn, "ann", Some(A)).is_ok());
        }
        let other = IpAddr::from([198, 51, 100, 7]);
        assert_eq!(
            t.begin(t0(), Scope::SignIn, "ann", Some(other)).err(),
            Some(30)
        );
    }

    #[test]
    fn success_gives_the_address_only_its_own_attempt_back() {
        let t = Throttle::new();
        for i in 0..(FREE_PER_ADDRESS - 1) {
            t.begin(t0(), Scope::SignIn, &format!("u{i}"), Some(A))
                .map(drop)
                .unwrap();
        }
        // The 20th attempt locks the address, and was right: the lock goes, 19 wrong attempts remain.
        t.begin(t0(), Scope::SignIn, "mine", Some(A))
            .unwrap()
            .succeed();
        let again = t.begin(t0(), Scope::SignIn, "x", Some(A));
        assert!(again.is_ok());
        // That was the 20th wrong one again: locked now, and a login in between does not wipe the count.
        assert!(t.begin(t0(), Scope::SignIn, "mine", Some(A)).is_err());
    }

    #[test]
    fn ipv6_clients_share_a_slash_64_and_v4_mapped_equals_v4() {
        assert_eq!(
            address_key("2001:db8:1:2:aaaa::1".parse().unwrap()),
            address_key("2001:db8:1:2:bbbb::9".parse().unwrap())
        );
        assert_ne!(
            address_key("2001:db8:1:2::1".parse().unwrap()),
            address_key("2001:db8:1:3::1".parse().unwrap())
        );
        assert_eq!(
            address_key("::ffff:192.0.2.1".parse().unwrap()),
            address_key(A)
        );
    }

    #[test]
    fn counts_are_forgotten_after_a_quiet_spell() {
        let t = Throttle::new();
        fail(&t, t0(), "ann", 5); // locked 30 s
        let later = t0() + secs(30 + FORGET_SECS);
        // Forgotten: five more wrong attempts are free again.
        fail(&t, later, "ann", 5);
        assert!(t.begin(later, Scope::SignIn, "ann", None).is_err());
    }

    #[test]
    fn the_map_stays_bounded() {
        let t = Throttle::new();
        for i in 0..(MAX_KEYS + 50) {
            t.begin(
                t0() + secs(i as i64 / 1000),
                Scope::SignIn,
                &format!("n{i}"),
                None,
            )
            .map(drop)
            .unwrap();
        }
        assert!(t.lock().len() <= MAX_KEYS + 1);
    }
}
