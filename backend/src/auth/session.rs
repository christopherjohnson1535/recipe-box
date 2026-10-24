use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use ports::SessionTokens;
use sha2::{Digest, Sha256};

/// Random 32-byte tokens, base64url. Only the SHA-256 of a token is stored.
pub struct RandomTokens;

impl SessionTokens for RandomTokens {
    fn generate(&self) -> String {
        URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
    }

    fn digest(&self, token: &str) -> Vec<u8> {
        Sha256::digest(token.as_bytes()).to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_random_and_hashed() {
        let t = RandomTokens;
        let (a, b) = (t.generate(), t.generate());
        assert_ne!(a, b);
        assert_eq!(URL_SAFE_NO_PAD.decode(&a).unwrap().len(), 32);
        assert_eq!(t.digest(&a).len(), 32);
        assert_eq!(t.digest(&a), t.digest(&a));
        assert_ne!(t.digest(&a), t.digest(&b));
        // SHA-256("abc")
        assert_eq!(t.digest("abc")[..4], [0xba, 0x78, 0x16, 0xbf]);
    }
}
