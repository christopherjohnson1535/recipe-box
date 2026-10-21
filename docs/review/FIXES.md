# Fix ledger

R4-01 fixed — page-styling.test.ts now allows only literal double-quoted `className="…"` outside `components/ui` (exempt by exact path), fails on `className={…}`, single quotes, template literals, spreads carrying className and `*Class` helpers/props, scans `.ts` and `lib/` too; self-test has every bypass from the finding.
R4-02 fixed — tokens.test.ts collects every `(--x)` / `var(--x)` read by `components/ui/*.tsx` and `globals.css`, fails if undefined, and fails on unread component tokens.
R4-03 fixed — added the missing pairs (chip hover, drop cap, ink and ink-muted on panel, input hover border, chip hover underline, alert rule, ghost underline); a test fails when a `-fg`/`-bg` component token has no pairing; `--button-ghost-underline` now `--color-rule-strong`.
R4-04 fixed — `ContentsEntry` wraps the kicker in `<div className="label">`, restoring 14px dots and 1.35 line height.
R4-05 fixed — tests assert the evening dark media query and `color-scheme: dark`, day `@theme static` with no media query; dead `delete` line removed.
R4-06 fixed — tokens.test.ts checks `themeColor` in layout.tsx and the manifest colours against the resolved `--color-paper` of day and evening.
R4-07 skipped — `<strong>` is acceptable emphasis semantics for the issue numbers.
R4-08 fixed — `Contents` label is optional and home no longer passes one, so the list takes its name from its section.
R4-09 fixed — moot: any `className={…}` is now a violation, with a message to use a ui component.
R4-10 fixed (SkipLink only) — `min-h-control` + `items-center` on focus; nav focus-ring clipping left as on `main`.
R4-11 skipped — unused variants kept; they carry tokens and pairs under test and no new ones are added.
D-01 fixed — new `ChipRow` in `ui/Chip.tsx` wraps chips with `flex-wrap`; home uses it, no horizontal scroller.
D-02 skipped — the narrower article column (max-w-measure-wide) inside the page is deliberate editorial framing.
D-03 skipped — trailing dots were chosen so no line starts with a dot; a leading separator only moves the orphan.
D-04 skipped — placeholder pages are replaced by their feature issues (#3, #7, #8, #13).
D-05 skipped — CSS columns would order entries top-to-bottom per column and scramble reading and focus order.
D-06 skipped — the selected chip already has a non-colour cue (the 2px accent underline).
D-07 fixed — `--cream-300` to #cdc3b0 and `--umber-700` to #463e33 in primitives; style lock updated; `--color-rule` stays decorative.
D-08 fixed — component token `--photo-filter` (none by day, `brightness(0.9) contrast(1.02)` in dark) applied in `LeadPhoto` and the contents thumbnail.
D-09 skipped — Add recipe is the page's primary action.
D-11 fixed — `PageHeader` gains `reserveDeck` (hidden non-breaking line at deck height); home sets it.
D-12 fixed — phone masthead nav loses its negative margin and items use `ps-0 pe-3` on phone, so the underline starts at the gutter.
D-13 skipped — italic placeholders are the documented style (docs/UI.md).
D-14 fixed — `overflow-wrap: anywhere` on h1–h3 became `break-word` and the redundant `break-words` on the entry link was removed, so only words longer than the line break.
D-15..D-22 (P2) deferred — not in scope for #2; revisit in Phase 1 design QA (#9).
R4-01 follow-up (orchestrator) — the stricter guard flagged the JS `class` keyword in lib/api.ts; `class` now only counts as a prop or key (`class=` / `class:`), with self-tests for both.
#6 S-01 fixed — `reencode` reads dimensions first (refuses >10,000 px a side or >40 MP as unsupported_media, an import warning) and sets decoder limits (max_alloc 256 MB); unit + upload + import tests with a generated 20000x20000 PNG header.
#6 S-02 fixed — `extract` runs in `spawn_blocking` under what is left of the 15 s budget (timeout → fetch_failed "took too long to read"); JSON-LD is found by a cheap scan, the DOM is only built for the microdata fallback and refused above 60k tags or depth 400 (→ no_recipe_found); og:/title via scans; tests with 100k nested divs.
#6 S-03 fixed — max 500 items per list, 10,000 chars per text field before cleanup, with a warning; runs inside the blocking task.
#6 S-04 fixed — durations over 7 days become null with a warning.
#6 S-05 fixed — tests added: redirect to ftp/gopher (loopback port allowed so only the scheme check refuses), chunked body with no Content-Length, slow-drip timeout (test-only FetchPolicy::with_timeout_for_tests), bad/huge/js:/data:/internal image URLs are warnings, loopback allowance is one port only. Removing the scheme check, chunk cap or DOM guard makes the matching test fail.
#6 S-06 skipped — test hook is unreachable from production; a cargo feature adds CI complexity for no gain.
#6 S-07 skipped — would break sites on odd ports for little gain (blind GET).
#6 S-08 skipped — wrong text only, not a one-liner.
#6 S-09 skipped — no change; frontend must keep escaping text (no dangerouslySetInnerHTML).
#6 S-10 skipped — orphan-image sweep belongs in a later cleanup issue.
#6 S-11 fixed (partly) — sourceUrl drops userinfo and fragment; first-recipe-wins and the second 15 s image budget left as is.
#6 ORCH-01 fixed (orchestrator, smoke test) — an invalid `url` reported `sourceUrl: …` from the shared helper, so the import form could not map it to its field; the route now answers `url: …`, asserted in import_url.rs.
#3 E-01 fixed — dirty form is stashed to sessionStorage (`rb-draft:<id|new>`, 400 ms debounce, all access try/catch, `recipe-form/draft-stash.ts` + test); cleared on save and on confirmed Cancel; on load a differing stash shows an Alert with Restore/Discard. beforeunload kept.
#3 E-02 fixed — Enter in a section heading is prevented and moves focus to the row text; `isComposing` Enter is ignored in item inputs, headings and the tag input (covers the IME Nice item).
#3 E-03 fixed — a blank heading after a named section shows the placeholder "No heading: continues without a section" and its remove button is labelled "Join <item> N to the previous section" and announces the join; smallest behaviour that makes the merge visible and deliberate.
#3 E-04 fixed — minutes validated in `submit` (whole numbers 0-10,000; the backend only rejects negatives, so 10,000 is a client limit); errors show on the field and the first one is focused; `max=10000` on the inputs; nothing is rounded silently.
#3 E-05 fixed (partial) — split-paste strips ▢ ☐ □ ✓ and splits on lone CR; test added. "For the sauce:" auto-heading skipped — a colon heuristic would misfire on ingredient lines ending in a colon.
#3 E-06 skipped — acceptable as is (Nice, no code change).
#3 E-07 fixed — dead `imageId`/`photoImageIds` entries removed from FIELD_KEYS.
#3 E-08 fixed — IME Enter ignored (see E-02); live note alternates a trailing zero-width space so repeated messages are re-announced (one line).
#3 E-09 fixed (partial) — removing a tag focuses the next tag's remove button, else the previous, else the tag input. Alt+Up/Down for tab stops skipped (optional).
#3 E-10 fixed (partial) — IconButton uses `size-control`. PhotoField button restyle skipped — the `file:` pseudo-element cannot take `buttonClass`; an sr-only input plus label is a bigger change. Double-announce of title+aria-label skipped.
#3 reuse notes (start dirty, original-photos slot) deferred to #7.
#3 ORCH-01 fixed — the bare "H" icon is now a ghost "Section" text button (aria-label still "Start a section at ingredient N"); unused heading icon removed.
#3 P2-1 fixed — PhotoField input is sr-only inside a label styled with buttonClass("secondary") ("Choose photo" / "Replace photo"), focus ring via has-[:focus-visible].
#3 P2-3 fixed — disabled IconButtons use text-ink-muted with a dotted border instead of opacity-55.
#3 P2-6 fixed — wiki says section headings stay put when moving items; use the arrows to move items between sections.
#3 P2-2, P2-4, P2-5 skipped — cosmetic / deliberate measure / "" matches the API default
#29 A-01 fixed — `action` removed from the login and setup forms, so a native POST goes to the current URL and keeps `?next=`; test asserts method post and no action.
#29 A-02 fixed — guard rewritten: every `<form` must state a literal method="post"|"get" (tag scanned past `{…}`, `method={"post"}` rejected as non-literal), and a file with a password input (any spelling) may not have a GET form; inline self-checks added; home search form got method="get"; RecipeForm got method="post" (one attribute, outside owned paths, needed by rule 1).
#29 A-03 skipped — a no-JS submit is rare and harmless now.
#29 A-04 skipped — acceptable.
#29 A-05 fixed — stray `export` of the old scanner dropped (new scanner functions are test-local; `export` kept off).
