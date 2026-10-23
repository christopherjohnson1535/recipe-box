//! Prints the OpenAPI spec: `cargo run --bin openapi > ../docs/openapi.json`.

fn main() {
    print!("{}", recipe_box_api::routes::openapi::json());
}
