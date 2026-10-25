//! Sealing Google refresh tokens before they reach the database (GRO-5) and the record of a Google sign-in in
//! progress before it reaches the browser (ACC-6): ChaCha20-Poly1305 with a random nonce. Each purpose has its own
//! context string bound into the seal, so one kind of blob never opens as the other.

use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use chacha20poly1305::{
    ChaCha20Poly1305, Key, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use domain::{DomainError, DomainResult, Secret, SignInFlow, chrono::DateTime, uuid::Uuid};
use ports::{FlowSealer, TokenCipher};
use serde::{Deserialize, Serialize};

const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
/// Binds a sealed blob to its purpose, so it cannot be opened as something else sealed with the same key.
const CONTEXT: &[u8] = b"recipe-box google refresh token v1";
/// The same for the `rb_oauth` cookie.
const FLOW_CONTEXT: &[u8] = b"recipe-box google sign-in flow v1";

/// Decodes `TOKEN_ENCRYPTION_KEY` (standard base64 of exactly 32 bytes).
pub fn parse_key(b64: &str) -> Result<[u8; KEY_LEN], String> {
    let bytes = STANDARD.decode(b64.trim()).map_err(|_| {
        "TOKEN_ENCRYPTION_KEY must be base64 (`openssl rand -base64 32`)".to_string()
    })?;
    <[u8; KEY_LEN]>::try_from(bytes.as_slice()).map_err(|_| {
        format!(
            "TOKEN_ENCRYPTION_KEY must decode to exactly {KEY_LEN} bytes, got {} (`openssl rand -base64 32`)",
            bytes.len()
        )
    })
}

/// A sealed blob is `nonce (12 bytes) || ciphertext || tag`. `context` is what the blob is for.
pub struct ChaChaCipher {
    aead: ChaCha20Poly1305,
    context: &'static [u8],
}

impl ChaChaCipher {
    /// For Google refresh tokens.
    pub fn new(key: &[u8; KEY_LEN]) -> Self {
        Self::for_context(key, CONTEXT)
    }

    fn for_context(key: &[u8; KEY_LEN], context: &'static [u8]) -> Self {
        Self {
            aead: ChaCha20Poly1305::new(&Key::from(*key)),
            context,
        }
    }

    fn seal_bytes(&self, plain: &[u8]) -> DomainResult<Vec<u8>> {
        let nonce_bytes: [u8; NONCE_LEN] = rand::random();
        let sealed = self
            .aead
            .encrypt(
                &Nonce::from(nonce_bytes),
                Payload {
                    msg: plain,
                    aad: self.context,
                },
            )
            .map_err(|_| DomainError::Internal("could not seal a token".into()))?;
        Ok([nonce_bytes.as_slice(), &sealed].concat())
    }

    /// `None` when `sealed` was not made by this key for this purpose or was changed.
    fn open_bytes(&self, sealed: &[u8]) -> Option<Vec<u8>> {
        let (nonce, body) = sealed.split_at_checked(NONCE_LEN)?;
        let nonce = Nonce::try_from(nonce).ok()?;
        self.aead
            .decrypt(
                &nonce,
                Payload {
                    msg: body,
                    aad: self.context,
                },
            )
            .ok()
    }
}

fn failed() -> DomainError {
    // Never the bytes. Most likely `TOKEN_ENCRYPTION_KEY` is not the key the token was sealed with.
    tracing::warn!(
        "a stored token could not be opened; is TOKEN_ENCRYPTION_KEY the key it was sealed with?"
    );
    DomainError::Internal("could not open a sealed token".into())
}

impl TokenCipher for ChaChaCipher {
    fn seal(&self, secret: &Secret) -> DomainResult<Vec<u8>> {
        self.seal_bytes(secret.expose().as_bytes())
    }

    fn open(&self, sealed: &[u8]) -> DomainResult<Secret> {
        let plain = self.open_bytes(sealed).ok_or_else(failed)?;
        String::from_utf8(plain)
            .map(Secret::new)
            .map_err(|_| failed())
    }
}

/// What the cookie holds, as JSON inside the seal.
#[derive(Serialize, Deserialize)]
struct FlowRecord {
    state: String,
    nonce: String,
    verifier: String,
    next: String,
    link_user: Option<Uuid>,
    /// Seconds since the Unix epoch.
    issued_at: i64,
}

/// Seals a [`SignInFlow`] for the `rb_oauth` cookie: JSON, sealed, base64url.
pub struct ChaChaFlowSealer(ChaChaCipher);

impl ChaChaFlowSealer {
    pub fn new(key: &[u8; KEY_LEN]) -> Self {
        Self(ChaChaCipher::for_context(key, FLOW_CONTEXT))
    }
}

/// A cookie that cannot be opened: tampered, from another key, or not ours. The flow is refused, nothing more.
fn unreadable_flow() -> DomainError {
    DomainError::validation("The sign-in record could not be read.")
}

impl FlowSealer for ChaChaFlowSealer {
    fn seal(&self, flow: &SignInFlow) -> DomainResult<String> {
        let record = FlowRecord {
            state: flow.state.expose().into(),
            nonce: flow.nonce.expose().into(),
            verifier: flow.code_verifier.expose().into(),
            next: flow.next.clone(),
            link_user: flow.link_user,
            issued_at: flow.issued_at.timestamp(),
        };
        let json = serde_json::to_vec(&record).map_err(DomainError::internal)?;
        Ok(URL_SAFE_NO_PAD.encode(self.0.seal_bytes(&json)?))
    }

    fn open(&self, sealed: &str) -> DomainResult<SignInFlow> {
        let bytes = URL_SAFE_NO_PAD
            .decode(sealed)
            .map_err(|_| unreadable_flow())?;
        let json = self.0.open_bytes(&bytes).ok_or_else(unreadable_flow)?;
        let r: FlowRecord = serde_json::from_slice(&json).map_err(|_| unreadable_flow())?;
        Ok(SignInFlow {
            state: Secret::new(r.state),
            nonce: Secret::new(r.nonce),
            code_verifier: Secret::new(r.verifier),
            next: r.next,
            link_user: r.link_user,
            issued_at: DateTime::from_timestamp(r.issued_at, 0).ok_or_else(unreadable_flow)?,
        })
    }
}

/// The cipher of a server without Google: there is nothing to seal, and anything stored earlier stays unreadable.
pub struct NoCipher;

impl TokenCipher for NoCipher {
    fn seal(&self, _: &Secret) -> DomainResult<Vec<u8>> {
        Err(DomainError::GoogleDisabled)
    }

    fn open(&self, _: &[u8]) -> DomainResult<Secret> {
        Err(DomainError::GoogleDisabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cipher(byte: u8) -> ChaChaCipher {
        ChaChaCipher::new(&[byte; KEY_LEN])
    }

    #[test]
    fn a_sealed_token_opens_again_and_hides_the_token() {
        let c = cipher(7);
        let secret = Secret::new("1//refresh-token-value");
        let a = c.seal(&secret).unwrap();
        let b = c.seal(&secret).unwrap();
        assert_ne!(a, b, "a fresh nonce each time");
        assert!(!a.windows(10).any(|w| w == b"1//refresh"));
        assert_eq!(c.open(&a).unwrap().expose(), "1//refresh-token-value");
        assert_eq!(c.open(&b).unwrap().expose(), "1//refresh-token-value");
    }

    #[test]
    fn a_changed_or_truncated_blob_is_refused() {
        let c = cipher(7);
        let sealed = c.seal(&Secret::new("token")).unwrap();
        for i in 0..sealed.len() {
            let mut bad = sealed.clone();
            bad[i] ^= 1;
            assert!(c.open(&bad).is_err(), "byte {i}");
        }
        assert!(c.open(&sealed[..sealed.len() - 1]).is_err());
        assert!(c.open(&sealed[..NONCE_LEN]).is_err());
        assert!(c.open(&[]).is_err());
    }

    #[test]
    fn another_key_cannot_open_it() {
        let sealed = cipher(1).seal(&Secret::new("token")).unwrap();
        assert!(cipher(2).open(&sealed).is_err());
    }

    #[test]
    fn the_key_must_be_32_bytes_of_base64() {
        let ok = STANDARD.encode([9u8; 32]);
        assert_eq!(parse_key(&ok).unwrap(), [9u8; 32]);
        assert_eq!(parse_key(&format!(" {ok}\n")).unwrap(), [9u8; 32]);
        for bad in [
            STANDARD.encode([9u8; 31]),
            STANDARD.encode([9u8; 33]),
            "not base64!".to_string(),
            String::new(),
        ] {
            assert!(parse_key(&bad).is_err(), "{bad}");
        }
    }

    fn flow() -> SignInFlow {
        SignInFlow {
            state: Secret::new("the-state"),
            nonce: Secret::new("the-nonce"),
            code_verifier: Secret::new("the-verifier"),
            next: "/recipes/3?x=1".into(),
            link_user: Some(Uuid::from_u128(7)),
            issued_at: DateTime::from_timestamp(1_767_225_600, 0).unwrap(),
        }
    }

    #[test]
    fn a_sealed_flow_opens_again_and_shows_nothing() {
        let sealer = ChaChaFlowSealer::new(&[7; KEY_LEN]);
        let (a, b) = (sealer.seal(&flow()).unwrap(), sealer.seal(&flow()).unwrap());
        assert_ne!(a, b, "a fresh nonce each time");
        assert!(
            a.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'),
            "cookie-safe: {a}"
        );
        let open = sealer.open(&a).unwrap();
        assert_eq!(
            (
                open.state.expose(),
                open.nonce.expose(),
                open.code_verifier.expose()
            ),
            ("the-state", "the-nonce", "the-verifier")
        );
        assert_eq!(
            (open.next.as_str(), open.link_user),
            ("/recipes/3?x=1", Some(Uuid::from_u128(7)))
        );
        assert_eq!(open.issued_at, flow().issued_at);
        let none = SignInFlow {
            link_user: None,
            ..flow()
        };
        assert_eq!(
            sealer.open(&sealer.seal(&none).unwrap()).unwrap().link_user,
            None
        );
        let shown = URL_SAFE_NO_PAD.decode(&a).unwrap();
        assert!(!shown.windows(9).any(|w| w == b"the-state"));
    }

    #[test]
    fn a_changed_made_up_or_foreign_cookie_is_refused() {
        let sealer = ChaChaFlowSealer::new(&[7; KEY_LEN]);
        let sealed = sealer.seal(&flow()).unwrap();
        let mut changed = URL_SAFE_NO_PAD.decode(&sealed).unwrap();
        changed[20] ^= 1;
        for bad in [
            URL_SAFE_NO_PAD.encode(changed),
            sealed[..sealed.len() - 1].to_string(),
            String::new(),
            "not base64!".into(),
            "AAAA".into(),
        ] {
            let e = sealer.open(&bad).unwrap_err();
            assert!(matches!(e, DomainError::Validation(_)), "{bad}: {e:?}");
        }
        let other = ChaChaFlowSealer::new(&[8; KEY_LEN]);
        assert!(other.open(&sealed).is_err());
    }

    #[test]
    fn the_two_purposes_never_open_as_each_other() {
        let key = [7; KEY_LEN];
        // A sealed refresh token is not a flow, even though both use the same key...
        let token = ChaChaCipher::new(&key).seal(&Secret::new("{}")).unwrap();
        assert!(
            ChaChaFlowSealer::new(&key)
                .open(&URL_SAFE_NO_PAD.encode(token))
                .is_err()
        );
        // ...and a sealed flow is not a refresh token.
        let flow = ChaChaFlowSealer::new(&key).seal(&flow()).unwrap();
        let bytes = URL_SAFE_NO_PAD.decode(flow).unwrap();
        assert!(ChaChaCipher::new(&key).open(&bytes).is_err());
    }
}
