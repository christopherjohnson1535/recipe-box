//! Sign in with Google (ACC-6) as a [`ports::GoogleSignIn`]: the OpenID Connect authorization-code flow with PKCE.
//!
//! The browser is sent to Google with `state`, `nonce` and an S256 challenge; the code that comes back is traded at
//! the token endpoint (client secret and PKCE verifier in the request body, never in a URL) for an ID token, which
//! is checked against Google's published keys: RS256 signature, `iss`, `aud` (our client id), `exp` and `nonce`.
//! The hosts are fixed (`SignInUrls::default`; tests point them at a local fake) and are not taken from any request.
//! Codes, tokens and the client secret appear in request bodies only, never in a URL, an error or a log line.

use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use domain::{DomainError, DomainResult, Secret, constant_time_eq, url::Url};
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use ports::{GoogleAccount, GoogleSignIn};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::{http_client, read, send};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";
const SCOPE: &str = "openid email profile";
/// Both spellings Google uses for the issuer of its ID tokens.
const ISSUERS: [&str; 2] = ["https://accounts.google.com", "accounts.google.com"];
/// How far off a clock may be before `exp` is held against the token.
const LEEWAY_SECS: u64 = 30;
/// Where Google sends the browser back, below `PUBLIC_URL`. Register it next to the Tasks one.
pub const SIGN_IN_CALLBACK_PATH: &str = "/api/auth/google/callback";

/// Google's three sign-in hosts. Production uses [`SignInUrls::default`]; tests point them at a local fake.
#[derive(Debug, Clone)]
pub struct SignInUrls {
    pub auth: String,
    pub token: String,
    /// The JSON Web Key Set the ID tokens are signed with.
    pub jwks: String,
}

impl Default for SignInUrls {
    fn default() -> Self {
        Self {
            auth: AUTH_URL.into(),
            token: TOKEN_URL.into(),
            jwks: JWKS_URL.into(),
        }
    }
}

pub struct GoogleSignInClient {
    http: reqwest::Client,
    client_id: String,
    client_secret: Secret,
    redirect_uri: String,
    urls: SignInUrls,
}

impl GoogleSignInClient {
    /// `public_url` is the address people use to reach the site, without a trailing slash.
    pub fn new(client_id: String, client_secret: Secret, public_url: &str) -> anyhow::Result<Self> {
        Self::with_base_urls(client_id, client_secret, public_url, SignInUrls::default())
    }

    /// Like [`GoogleSignInClient::new`] with other hosts; tests point them at a local fake.
    pub fn with_base_urls(
        client_id: String,
        client_secret: Secret,
        public_url: &str,
        urls: SignInUrls,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            http: http_client()?,
            client_id,
            client_secret,
            redirect_uri: format!(
                "{}{SIGN_IN_CALLBACK_PATH}",
                public_url.trim_end_matches('/')
            ),
            urls,
        })
    }

    /// Google's keys, fetched afresh for each sign-in: sign-ins are rare and Google rotates the keys.
    async fn keys(&self) -> DomainResult<Vec<Jwk>> {
        let res = send(self.http.get(&self.urls.jwks)).await?;
        Ok(read::<JwkSet>(res).await?.keys)
    }

    /// The ID token's claims once its signature and `iss`, `aud` and `exp` check out.
    async fn checked_claims(&self, id_token: &str) -> DomainResult<Claims> {
        let header = jsonwebtoken::decode_header(id_token).map_err(|_| unreadable())?;
        if header.alg != Algorithm::RS256 {
            return Err(refusal("the ID token is not signed with RS256"));
        }
        let kid = header
            .kid
            .ok_or_else(|| refusal("the ID token names no key"))?;
        let jwk = self
            .keys()
            .await?
            .into_iter()
            .find(|k| k.kid.as_deref() == Some(kid.as_str()) && k.kty == "RSA")
            .ok_or_else(|| refusal("Google has no key for the ID token"))?;
        let key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e).map_err(|_| unreadable())?;

        let mut rules = Validation::new(Algorithm::RS256);
        rules.set_audience(&[self.client_id.as_str()]);
        rules.set_issuer(&ISSUERS);
        rules.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        rules.leeway = LEEWAY_SECS;
        jsonwebtoken::decode::<Claims>(id_token, &key, &rules)
            .map(|t| t.claims)
            .map_err(|e| refusal(format!("the ID token was rejected ({:?})", e.kind())))
    }
}

/// An unreadable or refused reply, as the one sentence the person sees. `why` is for the log only (never a token).
fn refusal(why: impl AsRef<str>) -> DomainError {
    tracing::warn!("Google sign-in refused: {}", why.as_ref());
    DomainError::Google("Google could not confirm who you are.".into())
}

fn unreadable() -> DomainError {
    refusal("a reply could not be read")
}

#[derive(Deserialize)]
struct TokenReply {
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct JwkSet {
    #[serde(default)]
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
struct Jwk {
    kid: Option<String>,
    kty: String,
    #[serde(default)]
    n: String,
    #[serde(default)]
    e: String,
}

/// Google writes `email_verified` as a boolean, and in some older tokens as the text `"true"`.
#[derive(Deserialize)]
#[serde(untagged)]
enum Flag {
    Bool(bool),
    Text(String),
}

impl Flag {
    fn is_true(&self) -> bool {
        match self {
            Self::Bool(b) => *b,
            Self::Text(t) => t == "true",
        }
    }
}

#[derive(Deserialize)]
struct Claims {
    sub: String,
    email: Option<String>,
    email_verified: Option<Flag>,
    nonce: Option<String>,
}

/// The PKCE S256 challenge of a verifier: base64url of its SHA-256, unpadded (RFC 7636).
fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[async_trait]
impl GoogleSignIn for GoogleSignInClient {
    fn configured(&self) -> bool {
        true
    }

    fn authorize_url(&self, state: &str, nonce: &str, code_verifier: &str) -> DomainResult<Url> {
        let mut url = Url::parse(&self.urls.auth).map_err(|_| unreadable())?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", SCOPE)
            .append_pair("state", state)
            .append_pair("nonce", nonce)
            .append_pair("code_challenge", &challenge(code_verifier))
            .append_pair("code_challenge_method", "S256")
            .append_pair("prompt", "select_account");
        Ok(url)
    }

    async fn account(
        &self,
        code: &str,
        nonce: &str,
        code_verifier: &Secret,
    ) -> DomainResult<GoogleAccount> {
        let res = send(self.http.post(&self.urls.token).form(&[
            ("code", code),
            ("client_id", &self.client_id),
            ("client_secret", self.client_secret.expose()),
            ("redirect_uri", &self.redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier.expose()),
        ]))
        .await?;
        let reply: TokenReply = read(res).await?;
        let id_token = reply
            .id_token
            .filter(|t| !t.is_empty())
            .ok_or_else(|| refusal("Google sent no ID token"))?;

        let claims = self.checked_claims(&id_token).await?;
        // The nonce ties the token to the browser that started the sign-in.
        if !claims
            .nonce
            .as_deref()
            .is_some_and(|got| constant_time_eq(got, nonce))
        {
            return Err(refusal("the ID token's nonce does not match"));
        }
        let email = claims
            .email
            .filter(|e| !e.is_empty())
            .ok_or_else(|| refusal("the ID token has no email"))?;
        if claims.sub.is_empty() {
            return Err(refusal("the ID token has no subject"));
        }
        Ok(GoogleAccount {
            subject: claims.sub,
            email: email.to_lowercase(),
            email_verified: claims.email_verified.is_some_and(|f| f.is_true()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> GoogleSignInClient {
        GoogleSignInClient::new(
            "the-id".into(),
            Secret::new("the-secret"),
            "https://r.example/",
        )
        .unwrap()
    }

    #[test]
    fn the_challenge_is_the_s256_of_the_verifier() {
        // The example of RFC 7636, appendix B.
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn the_sign_in_url_asks_for_the_openid_scopes_with_state_nonce_and_pkce() {
        // A nonce made at run time: CodeQL reads a literal passed as a nonce as a hard-coded secret.
        let nonce = challenge(&std::process::id().to_string());
        let url = client().authorize_url("st&te", &nonce, "verifier").unwrap();
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://accounts.google.com"
        );
        assert_eq!(url.path(), "/o/oauth2/v2/auth");
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        for (k, v) in [
            ("client_id", "the-id"),
            ("redirect_uri", "https://r.example/api/auth/google/callback"),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("state", "st&te"),
            ("nonce", nonce.as_str()),
            ("code_challenge", challenge("verifier").as_str()),
            ("code_challenge_method", "S256"),
            ("prompt", "select_account"),
        ] {
            assert_eq!(q.get(k).map(String::as_str), Some(v), "{k}");
        }
        assert_eq!(q.len(), 9);
        let shown = url.as_str();
        assert!(
            !shown.contains("the-secret") && !shown.contains("verifier"),
            "{shown}"
        );
    }

    #[test]
    fn email_verified_may_be_a_boolean_or_the_text_true() {
        let flag = |json: &str| serde_json::from_str::<Flag>(json).unwrap().is_true();
        assert!(flag("true") && flag("\"true\""));
        assert!(!flag("false") && !flag("\"false\"") && !flag("\"yes\""));
    }
}
