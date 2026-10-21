/** Where the web server reaches the Rust API. Read per request so one image runs on any host. */
export function apiInternalUrl(): string {
  return (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}
