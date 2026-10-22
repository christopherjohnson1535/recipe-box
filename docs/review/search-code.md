# Review: issue #5 search, sort, tag filter (R1 query safety + R4 UI)

Load assumed: one household, up to ~2,000 recipes. Branch `issue-5-search` against `main`.
Run: `cargo test` search tests pass, `npx vitest run src/components/search` 12/12 pass.

## Fuzz result (query safety)
Every user value is bound (`$1..$6`); only the fixed `order` string is interpolated. Fuzzed through the real
endpoint (tower `oneshot`, throwaway test, deleted afterwards): ~60 nasty strings (`& | ! ( ) : * < > ' \ " -`, `a:*b`,
`<->`, `or`, SQL injection, emoji, combining marks, RTL, a 3,000-byte word, 3,000 and 6,000 word queries, 60 kB single word)
plus every one of 140,713 alphanumeric/printable code points alone and as `ab Xx`. Result: 1 non-200.
`q=a%00b` (NUL byte) returns **500** (Q-01). No tsquery syntax errors, no changed meaning, no wildcard leakage.
`websearch_to_tsquery` never errors. ILIKE escaping of `\ % _` correct (tests cover `%`, `_`).

## Findings

### Must
**Q-01 NUL in `q` returns 500** (and `tag`) - `backend/src/routes/recipes.rs:107` (and the `tag` trim a few lines below).
Case: `GET /api/recipes?q=a%00b` -> Postgres "invalid byte sequence 0x00" -> 500 `internal`. A pasted string can contain NUL.
Fix: `.map(|s| s.replace('\0', "").trim().to_string())` for `q` and `tag`. Add `"a\u{0}b"` to the fuzz list in `special_characters_are_literal_and_safe`.
(Must only because the issue is "never 500 on any input"; the old `strpos` path had the same hole.)

**Q-02 FND-2 (Must) says search by tag; tags are not searched** - `recipes.rs:57-61`, `docs/API.md` ("Tag names are not searched"), plan-5 item 2.
Case: recipe tagged `dinner` with no "dinner" in its text; type `dinner` -> "No recipes match" while the chip `dinner 12` shows right below.
Fix (query change, keeps GIN useful because the three existing terms already defeat it, see Q-05): add a fourth OR
`or exists (select 1 from recipe_tags rt join tags t on t.id = rt.tag_id where rt.recipe_id = r.id and t.name::text ilike $3)`
(tag name starts with q; `$3` is already escaped). Add a test (`q=dinner` finds the lasagne and soup) and fix the API.md/wiki line.
A generated-column change is not possible (tags live in a join table), so the query change is the smallest fix.

### Should
**Q-03 Search box vanishes on API error** - `frontend/src/app/(app)/page.tsx:43-50`. A transient 5xx while typing returns the
`header() + ServerError` branch without `SearchControls`; the input unmounts, focus and text are lost, and the person
cannot retry or clear the search. Fix: render `<SearchControls q tag sort />` in the error branch too (or put it above the try).


### Nice
**Q-05 OR of three conditions defeats the GIN index** - `recipes.rs:57-61`. EXPLAIN on 20,000 fat rows (12 ingredients,
notes, description): `Seq Scan ... Filter: (search @@ ... OR title ~~* ... OR search @@ ...)` 24 ms; websearch term alone uses
`Bitmap Index Scan` 0.35 ms. At 2,000 rows it is ~2 ms, at 20,000 ~24 ms (and run twice: list + count). Fine for the load; no action.
If it ever matters: drop the `ilike` term from WHERE (the prefix tsquery already covers title prefixes except punctuation like `100%`)
and keep it only in ORDER BY.

**Q-06 Timing test cannot fail** - `backend/tests/search.rs:381-419`. Rows are tiny (1 short description, 2 ingredients, no notes,
1 tag); real recipes carry 10-20 ingredients and long notes; a seq scan at 2,000 rows takes ~2 ms, so the 300 ms bound
only trips on a catastrophic bug. Make rows realistic (12 ingredients, ~500-char notes) and either assert `< 100 ms` or accept it
as a smoke test. Also the helper counts the whole HTTP round trip, which is what FND-2 wants; good.

**Q-07 Test gaps** - `search.rs:346-379`: the fuzz loop asserts 200 only, and `"%"` only `<= 1` hits (weak); no test for ranked pagination
(`q=...&limit=1&offset=1` stable order), for `sort=relevance` -> 400 specifically (only `bogus`), for non-last partial words
(`lasag week` finds nothing: prefix applies only to the last word, documented), for `tomatoes` vs `tomato` (no stemming; prefix finds
`tomato` -> `tomatoes` but not the reverse), or for hyphenated partials (`stir-fr` in an ingredient finds nothing; only title ILIKE saves titles).

**Q-08 Stale response can overwrite typing in a rare case** - `SearchControls.tsx:26-29`. `lastSent` moves to the newest sent value,
so if an older navigation (`q="ab"`) commits after `"abc"` was sent, the effect sets the input to `"ab"` mid-typing.
Next supersedes older transitions in practice, and the unit test covers only the one-step case. Smallest fix: keep a Set of sent values
(or compare against the input's current value: skip when `q` is a prefix of what is typed).

**Q-09 Live region only on non-empty results** - `ResultSummary.tsx`, `page.tsx:107`. `role="status"` inside the empty state is mounted fresh,
so screen readers often do not announce "Nothing matches". Render one persistent `role="status"` wrapper in the page for both states.
No loading indication while the transition runs (`useTransition` pending is discarded at `SearchControls.tsx:20`); the guidelines want a
visible loading cue. Use `isPending` for `aria-busy`/opacity on results.

**Q-10 Chip counts are global, results are filtered** - `page.tsx:88`. With `q=pasta`, chip `dinner 12` leads to 3 results. Acceptable
(FND-3 says "listed with counts"); mention in UI.md.

**Q-11 Select/Input standards** pass: `min-h-control` = 44 px, `text-body` 19 px (>= 16, no iOS zoom), labelled (`sr-only` labels),
focus ring inherited, `type=search`, `autoComplete=off`, no-JS GET form with hidden `tag` and `name=sort`.
Missing minor: `spellCheck={false}` is not needed for recipes; `enterKeyHint="search"` would help the iPad keyboard (one attribute).

## Correctness checks (pass)
Ingredient words, `buttermilk`, partial `lasag`, `weeknight lasag`, `Apple C`, case/padding, websearch phrase, `-`, `or`, tag + q AND,
`total` identical WHERE for list and count (ignores limit/offset), soft-deleted excluded (list and count), `sort=time` nulls last then
title then id, `title` and `newest` tie-break on `id`, ranked order ends in `r.id` so offset paging is stable, `sort=relevance`/`bogus` -> 400,
blank `q` = no filter, `ilike` escape of `\ % _`.

## Over-engineering
`search_terms` (28 lines, three branches for `"`, `-`, `or`) is the one complex piece; it is tested and the behaviour is documented. Acceptable.
`SearchControls` is lean (uncontrolled input, no debounce lib). No dead code found.
