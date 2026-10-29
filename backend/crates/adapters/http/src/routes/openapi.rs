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

use super::{
    auth, cook_log, export, favourites, grocery, health, imports, integrations, media, recipes,
    settings, setup, signin, tags, users,
};
use crate::extract::COOKIE_NAME;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Recipe Box API",
        description = "Conventions, error codes and limits: docs/API.md. Every non-2xx response is an `ErrorBody`.",
        license(name = "MIT", identifier = "MIT"),
    ),
    servers((url = "/", description = "Same origin: the web container proxies /api and /media to the API.")),
    tags(
        (name = "auth", description = "Sign in (password or Google), sign out, the current user and linked Google accounts."),
        (name = "export", description = "Download or restore the whole recipe box as a ZIP."),
        (name = "grocery", description = "The household grocery list: recipes, items, sections and staples."),
        (name = "health", description = "Liveness and database check."),
        (name = "import", description = "Turn links, text and photos into recipe drafts; nothing is saved."),
        (name = "integrations", description = "Connect a Google account to send the grocery list to Google Tasks."),
        (name = "media", description = "Upload and serve recipe images."),
        (name = "recipes", description = "Create, search, edit, delete and restore recipes."),
        (name = "settings", description = "Household settings."),
        (name = "setup", description = "First-run setup: create the first admin."),
        (name = "tags", description = "Tags in use across recipes."),
        (name = "users", description = "Household members. Admin only."),
    ),
    paths(
        health::health,
        setup::status,
        setup::create_admin,
        auth::login,
        auth::logout,
        auth::me,
        signin::providers,
        signin::start,
        signin::callback,
        signin::identities,
        signin::unlink,
        recipes::list,
        recipes::create,
        recipes::get,
        recipes::update,
        recipes::remove,
        recipes::restore,
        cook_log::list,
        cook_log::add,
        cook_log::remove,
        favourites::add,
        favourites::remove,
        settings::get,
        settings::update,
        grocery::get,
        grocery::clear,
        grocery::add_recipe,
        grocery::remove_recipe,
        grocery::add_item,
        grocery::update_item,
        grocery::remove_item,
        grocery::clear_checked,
        grocery::export_google_tasks,
        integrations::status,
        integrations::connect,
        integrations::callback,
        integrations::disconnect,
        tags::list,
        media::upload,
        media::serve,
        users::list,
        users::create,
        users::update,
        users::remove,
        users::set_password,
        export::export_zip,
        export::import_zip,
        imports::capabilities,
        imports::from_url,
        imports::from_text,
        imports::from_photo,
    ),
    components(schemas(recipes::RecipeSort)), // only named in a query parameter's `value_type`
)]
struct ApiDoc;

/// The `rb_session` cookie, referenced by every operation that needs a signed-in user. Public operations carry an
/// explicit empty `security` list.
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
/// required (a non-empty `security`), 413 where there is a body, 500 everywhere.
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
            if requires_session(op) {
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

/// `security(())` serializes as one empty requirement (`[{}]`), which means "no auth"; only a requirement naming a
/// scheme needs a session. utoipa cannot emit `[]`; `[{}]` (auth optional) and `[]` both mean no session here.
fn requires_session(op: &Operation) -> bool {
    let reqs = serde_json::to_value(&op.security).expect("security serializes");
    reqs.as_array().is_some_and(|a| {
        a.iter()
            .any(|r| r.as_object().is_some_and(|o| !o.is_empty()))
    })
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

/// The spec: this crate's paths, then the modifiers. `version` is the server's.
pub fn spec(version: &str) -> Spec {
    let mut spec = ApiDoc::openapi();
    let modifiers: [&dyn Modify; 3] = [&Session, &CommonErrors, &ExtensibleErrorCode];
    for m in modifiers {
        m.modify(&mut spec);
    }
    spec.info.version = version.to_string();
    spec
}

/// The spec as pretty JSON with a trailing newline. Keys are sorted (serde_json without `preserve_order`), so
/// the output is byte-for-byte stable.
pub fn json(version: &str) -> String {
    let mut out = serde_json::to_string_pretty(&spec(version)).expect("spec serializes");
    out.push('\n');
    out
}
