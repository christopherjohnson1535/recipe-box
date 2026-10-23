//! The OpenAPI spec (`docs/openapi.json`), generated from the `#[utoipa::path]` attributes on the handlers.
//! `cargo run --bin openapi > docs/openapi.json` rewrites it; a test and CI fail when it is stale.

use utoipa::{
    Modify, OpenApi,
    openapi::{
        OpenApi as Spec, RefOr, Schema,
        content::Content,
        path::Operation,
        response::ResponseBuilder,
        security::{ApiKey, ApiKeyValue, SecurityScheme},
    },
};

use super::{auth, export, health, imports, media, recipes, setup, tags, users};
use crate::auth::session::COOKIE_NAME;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Recipe Box API",
        description = "Conventions, error codes and limits: docs/API.md. Every non-2xx response is an `ErrorBody`.",
    ),
    paths(
        health::health,
        setup::status,
        setup::create_admin,
        auth::login,
        auth::logout,
        auth::me,
        recipes::list,
        recipes::create,
        recipes::get,
        recipes::update,
        recipes::remove,
        recipes::restore,
        tags::list,
        media::upload,
        media::serve,
        imports::capabilities,
        imports::from_url,
        imports::from_text,
        imports::from_photo,
        users::list,
        users::create,
        users::remove,
        users::set_password,
        export::export_zip,
        export::import_zip,
    ),
    components(schemas(recipes::RecipeSort)), // only named in a query parameter's `value_type`
    modifiers(&Session, &CommonErrors, &ExtensibleErrorCode),
)]
pub struct ApiDoc;

/// The `rb_session` cookie, referenced by every operation that needs a signed-in user.
struct Session;

impl Modify for Session {
    fn modify(&self, spec: &mut Spec) {
        let scheme = SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::with_description(
            COOKIE_NAME,
            "httpOnly session cookie set by login and setup.",
        )));
        spec.components
            .get_or_insert_default()
            .add_security_scheme("session", scheme);
    }
}

/// Errors any operation can produce, added unless the operation describes its own: 401 where a session is
/// required, 413 where there is a body, 500 everywhere.
struct CommonErrors;

impl Modify for CommonErrors {
    fn modify(&self, spec: &mut Spec) {
        let ops = spec.paths.paths.values_mut().flat_map(|item| {
            [
                &mut item.get,
                &mut item.post,
                &mut item.put,
                &mut item.delete,
            ]
        });
        for op in ops.flatten() {
            if op.security.is_some() {
                add_error(op, "401", "No or expired session (`unauthenticated`).");
            }
            if op.request_body.is_some() {
                add_error(op, "413", "Body over the size limit (`too_large`).");
            }
            add_error(
                op,
                "500",
                "Something went wrong on the server (`internal`).",
            );
        }
    }
}

/// `ErrorCode` grows over time, so the spec lists its values as `x-extensible-enum` (Zalando) instead of `enum`:
/// oasdiff then does not report a new code as a breaking change. The list comes from the generated schema.
struct ExtensibleErrorCode;

impl Modify for ExtensibleErrorCode {
    fn modify(&self, spec: &mut Spec) {
        let Some(RefOr::T(Schema::Object(obj))) = spec
            .components
            .as_mut()
            .and_then(|c| c.schemas.get_mut("ErrorCode"))
        else {
            panic!("ErrorCode must be an inline object schema");
        };
        let codes = obj
            .enum_values
            .take()
            .expect("ErrorCode must be a string enum");
        obj.extensions
            .get_or_insert_default()
            .insert("x-extensible-enum".into(), codes.into());
        let note = "New codes may be added; treat an unknown code as a generic error.";
        obj.description = Some(match obj.description.take() {
            Some(d) => format!("{d} {note}"),
            None => note.to_string(),
        });
    }
}

fn add_error(op: &mut Operation, status: &str, description: &str) {
    let content = Content::builder()
        .schema(Some(utoipa::openapi::Ref::from_schema_name("ErrorBody")))
        .build();
    let response = ResponseBuilder::new()
        .description(description)
        .content("application/json", content)
        .build();
    op.responses
        .responses
        .entry(status.to_string())
        .or_insert_with(|| response.into());
}

/// The spec as pretty JSON with a trailing newline. Keys are sorted (serde_json without `preserve_order`), so
/// the output is byte-for-byte stable.
pub fn json() -> String {
    let mut spec = ApiDoc::openapi();
    spec.info.version = env!("CARGO_PKG_VERSION").to_string();
    let mut out = serde_json::to_string_pretty(&spec).expect("spec serializes");
    out.push('\n');
    out
}
