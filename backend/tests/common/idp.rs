//! A local stand-in for Google as an OpenID Connect provider, on 127.0.0.1 (no real network): a token endpoint that
//! checks the client, the redirect address and the PKCE verifier like Google does, and a JWKS endpoint. ID tokens are
//! signed with a throwaway RSA key made for these tests (it signs nothing anywhere else; its public half is what the
//! fake serves as Google's key). Tests mint a token with `Id::new(..)`, hand its code to the app and read what
//! the app sent to the token endpoint from `token_requests()`.
//!
//! ```ignore
//! let idp = FakeIdp::start().await;
//! let app = TestApp::spawn_as_admin_with(|s| idp.enable(s)).await;
//! ```

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Form, Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use recipe_box_api::{config::Secret, crypto::ChaChaFlowSealer, state::AppState};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub const CLIENT_ID: &str = "idp-client-id.apps.test";
pub const CLIENT_SECRET: &str = "idp-client-secret";
pub const PUBLIC_URL: &str = "https://recipes.test";
pub const REDIRECT_URI: &str = "https://recipes.test/api/auth/google/callback";
/// The key the app's cookie sealer uses in these tests.
pub const KEY: [u8; 32] = [43; 32];
pub const KID: &str = "test-key-1";

// A 2048-bit RSA key generated only for these tests (PKCS#1, DER, base64), and its public modulus (base64url). The
// exponent is 65537 (`AQAB`).
const PRIVATE_KEY_DER_B64: &str = include_str!("idp_test_key.der.b64");
// A second throwaway key the fake never serves: what a forger who signs with his own key has.
const OTHER_KEY_DER_B64: &str = include_str!("idp_other_key.der.b64");
const PUBLIC_N: &str = "tCn3-EMVzywDo8HCKTdaA4vbkh9tkQ2IBrWgwFaO6T0bBn0dV0kr2rbd0kYxy_x_mYV0adczFWPYdQEwXzTp3d5wrVyCoq1FWWVchVFIEcKUpxKH2qb8yaZ_g5QNID0Nt-cAPDm9L4eY0KA31A_PrvLFJ77mZeC1Q21b9sVYzkycBLIXxTqcEz6M0rblclS9g3sQORvvBDiTLVjX_Xrp0LdesM6lEhr5wT5yIj_EV6VAhDAYL_6kmlhnP894Ijy31ozYp_TfGZhIUWbSlVOdY7A-Tmojcx7gnXg1Prfq-gNRZxVbdW3aU5Xh4ECNzLXlyhyIfn_bN7-I4uiUErZV2Q";

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// An ID token to mint: valid by default, spoilable field by field.
#[derive(Clone)]
pub struct Id {
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub email: Option<String>,
    pub email_verified: Value,
    pub nonce: Option<String>,
    /// Seconds from now (negative: already expired).
    pub expires_in: i64,
    /// The `kid` in the header.
    pub kid: String,
}

impl Id {
    /// A valid token for `sub`/`email` answering the sign-in that sent `nonce`.
    pub fn new(sub: &str, email: &str, nonce: &str) -> Self {
        Self {
            iss: "https://accounts.google.com".into(),
            aud: CLIENT_ID.into(),
            sub: sub.into(),
            email: Some(email.into()),
            email_verified: json!(true),
            nonce: Some(nonce.into()),
            expires_in: 3600,
            kid: KID.into(),
        }
    }

    fn claims(&self) -> Value {
        let mut c = json!({
            "iss": self.iss, "aud": self.aud, "sub": self.sub, "azp": CLIENT_ID,
            "iat": now_secs(), "exp": now_secs() + self.expires_in,
            "email_verified": self.email_verified, "name": "A Person",
        });
        if let Some(e) = &self.email {
            c["email"] = json!(e);
        }
        if let Some(n) = &self.nonce {
            c["nonce"] = json!(n);
        }
        c
    }

    /// Signed with the key the fake serves.
    pub fn mint(&self) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(self.kid.clone());
        let der = base64::engine::general_purpose::STANDARD
            .decode(PRIVATE_KEY_DER_B64.trim())
            .unwrap();
        jsonwebtoken::encode(&header, &self.claims(), &EncodingKey::from_rsa_der(&der)).unwrap()
    }

    /// Signed with another RSA key, under the `kid` of the key the fake serves: the signature cannot fit.
    pub fn mint_with_other_key(&self) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(self.kid.clone());
        let der = base64::engine::general_purpose::STANDARD
            .decode(OTHER_KEY_DER_B64.trim())
            .unwrap();
        jsonwebtoken::encode(&header, &self.claims(), &EncodingKey::from_rsa_der(&der)).unwrap()
    }

    /// `alg: none` and no signature: what a forger who drops the signature would send.
    pub fn mint_alg_none(&self) -> String {
        let header = json!({ "alg": "none", "typ": "JWT", "kid": self.kid });
        let part = |v: &Value| URL_SAFE_NO_PAD.encode(v.to_string());
        format!("{}.{}.", part(&header), part(&self.claims()))
    }

    /// Signed with the key, then the payload swapped for another one: the signature no longer fits.
    pub fn mint_tampered(&self, other: &Id) -> String {
        let (head, rest) = self
            .mint()
            .split_once('.')
            .map(|(h, r)| (h.to_string(), r.to_string()))
            .unwrap();
        let signature = rest.split_once('.').unwrap().1.to_string();
        let payload = URL_SAFE_NO_PAD.encode(other.claims().to_string());
        format!("{head}.{payload}.{signature}")
    }

    /// An HS256 token keyed with the public modulus: what an attacker who swaps the algorithm would send.
    pub fn mint_hs256(&self) -> String {
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some(self.kid.clone());
        let secret = URL_SAFE_NO_PAD.decode(PUBLIC_N).unwrap();
        jsonwebtoken::encode(&header, &self.claims(), &EncodingKey::from_secret(&secret)).unwrap()
    }
}

struct Issued {
    id_token: String,
    /// The PKCE challenge the sign-in sent; the verifier must hash to it.
    challenge: String,
}

#[derive(Default)]
struct Inner {
    codes: HashMap<String, Issued>,
    /// The form of every token request.
    token_requests: Vec<HashMap<String, String>>,
    jwks_requests: usize,
    counter: u64,
}

#[derive(Clone)]
pub struct FakeIdp {
    /// `http://127.0.0.1:<port>`
    pub base_url: String,
    inner: Arc<Mutex<Inner>>,
}

type Shared = State<Arc<Mutex<Inner>>>;

impl FakeIdp {
    pub async fn start() -> Self {
        let inner = Arc::new(Mutex::new(Inner::default()));
        let app = Router::new()
            .route("/token", post(token))
            .route("/certs", get(certs))
            .with_state(inner.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { base_url, inner }
    }

    /// Points `state` at this fake: the sign-in adapter on its hosts, and the real cookie sealer.
    pub fn enable(&self, state: &mut AppState) {
        let urls = adapter_google::SignInUrls {
            auth: "https://accounts.test/o/oauth2/v2/auth".into(),
            token: format!("{}/token", self.base_url),
            jwks: format!("{}/certs", self.base_url),
        };
        let client = adapter_google::GoogleSignInClient::with_base_urls(
            CLIENT_ID.into(),
            Secret::new(CLIENT_SECRET),
            PUBLIC_URL,
            urls,
        )
        .unwrap();
        state.google_signin = Arc::new(client);
        state.flows = Arc::new(ChaChaFlowSealer::new(&KEY));
    }

    /// The code Google would send back for a sign-in that sent `challenge`, worth `id_token`.
    pub fn code_for(&self, challenge: &str, id_token: String) -> String {
        let mut g = self.inner.lock().unwrap();
        g.counter += 1;
        let code = format!("code-{}", g.counter);
        g.codes.insert(
            code.clone(),
            Issued {
                id_token,
                challenge: challenge.into(),
            },
        );
        code
    }

    pub fn token_requests(&self) -> Vec<HashMap<String, String>> {
        self.inner.lock().unwrap().token_requests.clone()
    }

    pub fn jwks_requests(&self) -> usize {
        self.inner.lock().unwrap().jwks_requests
    }
}

fn oauth_error(status: u16, error: &str) -> Response {
    (
        StatusCode::from_u16(status).unwrap(),
        Json(json!({ "error": error })),
    )
        .into_response()
}

async fn token(State(inner): Shared, Form(f): Form<HashMap<String, String>>) -> Response {
    let mut g = inner.lock().unwrap();
    g.token_requests.push(f.clone());
    let field = |k: &str| f.get(k).map(String::as_str);
    if field("client_id") != Some(CLIENT_ID) || field("client_secret") != Some(CLIENT_SECRET) {
        return oauth_error(401, "invalid_client");
    }
    if field("grant_type") != Some("authorization_code") {
        return oauth_error(400, "unsupported_grant_type");
    }
    if field("redirect_uri") != Some(REDIRECT_URI) {
        return oauth_error(400, "redirect_uri_mismatch");
    }
    // A code works once.
    let Some(issued) = field("code").and_then(|c| g.codes.remove(c)) else {
        return oauth_error(400, "invalid_grant");
    };
    let verifier = field("code_verifier").unwrap_or_default();
    if URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) != issued.challenge {
        return oauth_error(400, "invalid_grant");
    }
    Json(json!({
        "access_token": "never-used-access-token", "expires_in": 3599, "token_type": "Bearer",
        "scope": "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        "id_token": issued.id_token,
    }))
    .into_response()
}

async fn certs(State(inner): Shared) -> Response {
    inner.lock().unwrap().jwks_requests += 1;
    Json(json!({ "keys": [
        { "kid": "some-other-key", "kty": "RSA", "alg": "RS256", "use": "sig", "n": "AQAB", "e": "AQAB" },
        { "kid": KID, "kty": "RSA", "alg": "RS256", "use": "sig", "n": PUBLIC_N, "e": "AQAB" },
    ] }))
    .into_response()
}
