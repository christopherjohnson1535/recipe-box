//! Sealing Google refresh tokens before they reach the database (GRO-5): ChaCha20-Poly1305 with a random nonce.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chacha20poly1305::{
    ChaCha20Poly1305, Key, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use domain::{DomainError, DomainResult, Secret};
use ports::TokenCipher;

const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
/// Binds a sealed blob to its purpose, so it cannot be opened as something else sealed with the same key.
const CONTEXT: &[u8] = b"recipe-box google refresh token v1";

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

/// A sealed token is `nonce (12 bytes) || ciphertext || tag`.
pub struct ChaChaCipher(ChaCha20Poly1305);

impl ChaChaCipher {
    pub fn new(key: &[u8; KEY_LEN]) -> Self {
        Self(ChaCha20Poly1305::new(&Key::from(*key)))
    }
}

fn failed() -> DomainError {
    DomainError::Internal("could not open a sealed token".into())
}

impl TokenCipher for ChaChaCipher {
    fn seal(&self, secret: &Secret) -> DomainResult<Vec<u8>> {
        let nonce_bytes: [u8; NONCE_LEN] = rand::random();
        let sealed = self
            .0
            .encrypt(
                &Nonce::from(nonce_bytes),
                Payload {
                    msg: secret.expose().as_bytes(),
                    aad: CONTEXT,
                },
            )
            .map_err(|_| DomainError::Internal("could not seal a token".into()))?;
        Ok([nonce_bytes.as_slice(), &sealed].concat())
    }

    fn open(&self, sealed: &[u8]) -> DomainResult<Secret> {
        let (nonce, body) = sealed.split_at_checked(NONCE_LEN).ok_or_else(failed)?;
        let nonce = Nonce::try_from(nonce).map_err(|_| failed())?;
        let plain = self
            .0
            .decrypt(
                &nonce,
                Payload {
                    msg: body,
                    aad: CONTEXT,
                },
            )
            .map_err(|_| failed())?;
        String::from_utf8(plain)
            .map(Secret::new)
            .map_err(|_| failed())
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
}
