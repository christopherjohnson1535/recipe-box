# Review R2: link import, imports and media security (issue #6)

Scope: `git diff main...HEAD`. Method: read the code, ran `cargo test --test import_url` (10 pass), and probed with
throwaway code in `/tmp/probe6` (not in the repo): a local TCP server for redirects/slow bodies, `url` host parsing,
a PNG bomb, and nested HTML.

Counts: Must 2, Should 3, Nice 6. Everything else in the brief was checked and holds (see "Checked, no finding").

## Must

### S-01 Must: image decode has no dimension or allocation limit (memory DoS from any imported page)
`backend/src/routes/media.rs:96-98` (`into_decoder` then `DynamicImage::from_decoder`), reached from
`routes/imports.rs:88-89`. The remote photo URL is chosen by the page author and the download cap is
`MAX_UPLOAD_MB` (15), so a 5.8 MB PNG of 20000x20000 pixels (all zero, compresses to 5.8 MB) is accepted.
Probe: `reencode()` on it reached 1.24 GB RSS (VmHWM) in 12 s and was still running at 100 s (debug build); no error.
The `image` limits are not applied on this path. A few of these, or one bigger, gets the API OOM-killed.
Fix: before `from_decoder`, `let mut l = image::Limits::default(); l.max_image_width = Some(10_000); l.max_image_height = Some(10_000); l.max_alloc = Some(256 << 20); decoder.set_limits(l).map_err(|_| unsupported())?;`
(or check `decoder.dimensions()` first). Add a test with a small-bytes, huge-dimension PNG expecting a warning.

### S-02 Must: HTML parse is quadratic on deeply nested markup, runs on the async worker outside the 15 s timeout
`backend/src/import/jsonld.rs:20` (`Html::parse_document`), called synchronously from `routes/imports.rs:47`.
The 5 MB fetch cap allows about 900k nested tags. Probe (`<html><body>` + N x `<div>`): N=5k 1.3 s, 10k 5.6 s,
20k 22 s, 40k 88 s (debug build, quadratic; a 200 KB page). A 5 MB page would run for hours, pins a tokio worker
(the total timeout in `safe_fetch::fetch` has ended by then and cannot cancel sync code), and repeated requests
exhaust the runtime. Needs a session, but any recipe page the household opens can be hostile.
Fix: in `from_url`, refuse early when the page is implausibly tag-dense (for example
`page.body.iter().filter(|&&b| b == b'<').count() > 60_000` returns `NoRecipeFound`/`FetchFailed` "too complex"),
and run `extract` in `tokio::task::spawn_blocking`. Add a test with 100k nested divs expecting an error in under 2 s.

## Should

### S-03 Should: 6 MB of ingredient strings takes 8.4 s of CPU on the async worker
`jsonld.rs:50-54` (`plain` builds an `Html::parse_fragment` for every string containing `<` or `&`), per ingredient.
Probe: 200,000 ingredients like `"3 <b>cup</b> &amp; flour"` (6.3 MB JSON-LD): 8.4 s debug. Same sync-on-worker issue as S-02.
Fix: `spawn_blocking` (covered by S-02), and cap items: take at most ~500 ingredients and ~500 steps per recipe.

### S-04 Should: absurd durations become `i32::MAX` minutes
`jsonld.rs:108-114`. `"prepTime":"P99999999999D"` gives `prepMinutes: 2147483647` in the draft (probe). Not unsafe,
but the user then gets a save failure or a nonsense field. Fix: `(m > 0 && m <= 60 * 24 * 14).then_some(m)` (reject over two weeks).

### S-05 Should: tests do not cover several guards, so removing them would still pass
`backend/tests/import_url.rs`. Not covered by any test (probe results above show the code is currently right):
(a) redirect to `file:`/`gopher:`/scheme change (safe_fetch.rs scheme check could be deleted and every test passes, since the
`/to-*` tests only use http targets); (b) 15 s total timeout with a slow-drip body (`/drip` took exactly 15.0 s in the probe);
(c) streaming cap with no Content-Length (`/huge` in the test uses axum's Content-Length, so only the header check at
`safe_fetch.rs:107` is exercised; the chunk check at line 119 is untested); (d) image that is not an image / image URL
`javascript:`, `data:`, internal IP (only a 404 is tested at `/missing`); (e) `FetchPolicy` loopback allowance not extending to
other ports on a direct request. Fix: add (a), (c), (d) as integration tests with a raw chunked response; (b) as a unit test
with a shortened timeout constant behind `#[cfg(test)]`.

## Nice

- S-06 Nice, `safe_fetch.rs:46-50`: `allow_loopback_port_for_tests` is a `pub` function in the library, so any future code could call it. It is not
  reachable from production today (only `state.rs` builds `FetchPolicy::default()`, no env/request path, `loopback_port` is private).
  It also allows all of 127.0.0.0/8 and `::1` on that port, not just 127.0.0.1. Fix: gate behind a `test-support` cargo feature, or leave and keep the grep in review.
- S-07 Nice, `safe_fetch.rs:171-186`: any port on a public host is allowed (for example `:6379`, `:22`). Only a blind GET to public hosts, so the risk is low;
  a cheap tightening is `matches!(port, 80 | 443 | 8080 | 8443)`... only if no household recipe site needs odd ports.
- S-08 Nice, `jsonld.rs:90,357,401,406`: microdata/title text uses `.text()`, which includes nested `<script>`/`<style>` content
  (`<span itemprop=name>M<script>evil()</script></span>` gives title `Mevil()`; ingredient `a<style>x{}</style>b` gives `ax{}b`). Plain text only, no markup, but wrong. Fix: skip script/style descendants.
- S-09 Nice, `jsonld.rs:50-64`: entity-encoded markup is decoded to literal text (`&lt;img src=x onerror=alert(1)&gt;` becomes the title text `<img src=x onerror=alert(1)>`).
  Safe because the frontend has no `dangerouslySetInnerHTML` (checked with grep); it stays a rule for the frontend to keep text escaped.
- S-10 Nice, `routes/imports.rs:81-103`: each import stores the photo (file plus `images` row) before the user saves; abandoned drafts leave orphan images, and re-importing the same link stores another copy. Acceptable for ~2,000 recipes; note a sweep of unreferenced images older than a day for later. A failed download or decode stores nothing (the file is removed if the insert fails, `media.rs:68-71`).
- S-11 Nice, `jsonld.rs:40`, `safe_fetch.rs`: `sourceUrl` keeps userinfo from the final URL (`https://user:pw@host/...`) and fragments. Strip with `set_username("")`/`set_password(None)` before storing.
  Also only the first Recipe on a page is used (multiple recipes per page: first wins), and the image step can take up to a second 15 s, so a request can last about 30 s plus parse.

## Checked, no finding

1. SSRF classifier (`safe_fetch.rs:208-262`, unit tests plus my probes). v4: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 255.255.255.255 all refused. v6: `::`, `::1`, `::/96`, fc00::/7, fe80::/10, fec0::/10, ff00::/8, `::ffff:0:0/96` (judged as v4), 64:ff9b::/96 (judged as v4), 64:ff9b:1::/48, 2001::/23 (Teredo), 2001:db8::/32, 3fff::/20, 2002::/16 (judged by embedded v4) refused; the `2000::/3` allowlist drops everything else.
   Host forms (probe, default policy): `http://2130706433/`, `0x7f.1`, `017700000001`, `127.1`, `0`, full-width and circled digits are normalised by the `url` crate to `127.0.0.1` and refused (`blocked_address`). `[fe80::1%25eth0]` is a parse error. `user@127.0.0.1` and `user:p@[::1]` refused (host is what is checked). `localhost.`, `127.0.0.1.nip.io`, `metadata.google.internal` fail resolution here (`fetch_failed`); a name that resolves to an internal IP is refused because ANY answer being non-public refuses the hop (`safe_fetch.rs:172`).
2. DNS rebinding: the hop resolves once and builds a new client with `resolve_to_addrs(domain, vetted)` (`:187-195`); the URL keeps the domain, so TLS SNI and Host are the real name while the socket goes to the vetted IP. IP-literal hosts connect directly. No second lookup happens.
3. Proxy env: `.no_proxy()` at `safe_fetch.rs:189`. Probe run with `HTTP_PROXY`/`http_proxy`/`ALL_PROXY` set to a dead port still fetched the local server.
4. Redirects (probe against a local server): relative OK; `file:///etc/passwd`, `gopher://`, protocol-relative `//127.0.0.1:otherport/`, `http://127.0.0.1:otherport/` all `blocked_address`; self-loop gives `fetch_failed` "Too many redirects" after 6 requests; each hop is vetted again.
5. Test-only policy: see S-06. Opening port P does not allow a redirect to another port (probe: `other` and direct `port2` request both blocked).
6. Limits: one `tokio::time::timeout(15 s)` wraps the whole `follow` loop, so it is total across all redirects, DNS, headers and body (probe: slow-drip body ended at 15.002 s; endless header drip ended with an error in 9 ms because hyper rejects it). Body cap is checked per chunk before extending (`:119`) and via Content-Length (`:107`); infinite 64 KB chunk stream stopped immediately at "too large". reqwest has no `gzip`/`brotli`/`deflate` feature (checked `cargo tree -e features`), so no `Accept-Encoding` is sent and nothing is decompressed; even if enabled later, `chunk()` yields decompressed bytes, so the cap would still apply. JSON nesting: serde_json's 128 recursion limit (probe: 100k `[` returns quickly, 120-deep `itemListElement` returns without overflow); `collect_steps` recursion is bounded by that.
7. Images: always `reencode` to JPEG (`media.rs:87-110`), never stored as sent; content-type is not trusted (format guessed from bytes). `javascript:`/`data:` image URLs join to non-http URLs and are refused by the scheme check in `send`, ending as a warning (`imports.rs:90-100`, `image_url` is `take`n so the bad URL is not returned). Failure leaves nothing half-saved. Dimension bomb: see S-01.
8. Contract: route needs `CurrentUser` (test `bad_input_and_no_session` gives 401); bad URL gives 400 `validation`; `blocked_address` 422, `site_blocked`/`fetch_failed` 502, `no_recipe_found` 422 match `docs/API.md:22-26`. The import never writes to `recipes` (test asserts count 0). `duplicate_of` filters `deleted_at is null` (test covers delete), compares normalised URLs, and returns only an id of a household-shared recipe. The `ilike '%host%'` pattern is a superset prefilter (host cannot contain `%`), then exact comparison in Rust.
9. Parsing: `PT1H30M` gives 90, `P0DT20M` gives 20, `PT-5M`, `PT`, `1h` give none, keywords as string or array both split, `@type` arrays work, relative and protocol-relative image URLs resolve against the final URL, multiple recipes: first used.
