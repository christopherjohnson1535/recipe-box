
## #40 recipe spread
UI-1 — fixed: print grid is two columns (`print:grid-cols-[5.5rem_…]`) and rows `break-inside-avoid`; evening print already forced to ink on white by the print token reset (the new evening chip/bar tokens only resolve to those paper/ink tokens)
UI-2 — fixed: lead photo wrapper `print:hidden`, headline `break-after-avoid`
UI-3 — fixed: servings that are not a bare number or range are set as 1.5rem text (`text` item), not display numerals
UI-4 — fixed: bar status is nowrap with a short form below 640px ("N checked"), full text from sm up; one line, CTA kept
UI-5 — fixed: both evening blocks re-point `--timer-*` and `--bar-*` at paper-deep/ink, chip has a hairline border; tokens.test resolves evening overrides and checks the pairs (≥ 4.5:1 / 3:1)
UI-6 — fixed: `scaleQuantity` formats at ×1 too (½, 1½, 2–3); a decimal with no tidy fraction stays as written
UI-7 — fixed: new `scaleServings` sets "6-8" as "6–8" at every scale
UI-8 — fixed (per orchestrator): hours/minutes as side-by-side number + small unit ("3hr 20min"); no "3:20"
UI-9 — fixed: long notes render a paragraph per line break; the display quote is for single-line notes of 140 characters or fewer
UI-10 — fixed: removed the tag icon from the kicker badges (only the large icon remains, and only without a photo)
UI-11 — fixed: opener keeps Start cooking; the bar appears once it scrolls away
UI-12 — fixed: method groups gap-8 apart, kicker gap-3 to its own steps
UI-13 — fixed: quantity is struck and turns ink-muted when ticked (no opacity, so contrast holds)
UI-14 — fixed: `li:target > button` gets a tint and claret bar that fades after a moment; no animation under reduced motion (colour stays); scroll-mt-24 on phone
UI-15 — fixed: photo wrapper `lg:-mb-10` so it lands on the rule; right bleed skipped as optional
UI-16 — fixed: chip is leading-none with 3px padding, no vertical offset
UI-17 — fixed: quantity column 6.25rem from sm, break-words not anywhere
UI-18 — skipped: the empty quantity column keeps names aligned by design; the review itself says to leave it
UI-19 — fixed: lede left aligned
UI-20 — fixed: radiogroup label "Scale ingredients"
UI-21 — fixed: moot, kicker icons removed (UI-10)
UI-22 — fixed: `typographic()` curls apostrophes in the headline and notes (the `<title>` is unchanged)
INT-1 — fixed: as UI-1
INT-2 — fixed in markup, e2e untouched: a real space between quantity and name ("500 g mince"); timer chip wraps the step's original words with no duplicate label, component test asserts a step's textContent equals the source text
INT-3 — fixed: thousands separators parse ("1,000 g" × 2 = "2,000 g"); "1,5 kg" is left alone; large values are formatted with grouping
INT-4 — fixed: "1-1/2 cups" reads as a mixed number; a second fraction after the quantity ("1 1/2-inch piece") leaves the line unscaled
INT-5 — fixed: a line with "plus/and/+ N" or "cup/240 ml" is left unscaled; "2 cups plus 2 tbsp" scaling only the first was rejected as a wrong recipe, so the whole line stays
INT-6 — fixed: following a mention focuses the row's button, the row is highlighted (UI-14), coarse-pointer hit area grows to 44px via a pseudo-element without moving text
INT-7 — fixed in part: sprig, head, stalk, piece, package, dash, handful added as units and pluralised; bare count nouns ("2 eggs" × ½ = "1 eggs", "1 egg" × 2 = "2 egg") skipped: needs a noun word list, noted as a shortcut in scale.ts
INT-8 — fixed: formatting at ×1 and U+2044 normalised to "/"; 1/3 halved to ⅛ rather than ⅙ is a limit of the eighths format (no sixths glyph used), left
INT-9 — skipped: pre-existing; main has the same loadRecipe notFound() in page.tsx under the same loading.tsx, so streaming makes it a soft 404 there too
INT-10 — fixed: moot, compact chip labels removed (chips show the step's own words)
INT-11 — skipped: nice; grouping at ≥ 1,000 now done, the 0.4 → ⅜ rounding is the documented eighths behaviour
INT-12 — fixed: a leading "(14 oz)" is skipped when naming an ingredient so "1 (14 oz) can tomatoes" links; "1 can (14 oz) tomatoes" already works
INT-13 — fixed: the words are real text once, no duplicate label
O42-01 fixed — after the draft the tilted photo stays on the dark stage (sticky at lg, above the draft below), region boxes drawn when present, other photos in a strip under it
O42-02 fixed — claret kicker, display-size title, body-size rows with a check or ? at the left and the quantity from splitIngredient in a claret tabular column
O42-03 fixed — the ? badge moved to the row's left, wash across the row, aria-label kept
O42-04 fixed — added --color-attention, --color-on-attention, --color-stage, --color-on-stage (day and evening, both evening blocks) with contrast tests in tokens.test.ts; Darkroom uses them, no hex left (approved deviation)
O42-05 fixed — ScanHeading "Reading your page / Hold tight…" over the stage while in flight (aria-hidden; the Pending box stays the live status)
O42-06 fixed — pulsing attention dot beside the scanning label, motion-safe only
R42-01 fixed — every row is shown and flagged; only the stagger delay is capped at 12 rows (test with 20 rows, flag on the 15th)
R42-02 fixed — regions need w,h > 0, x+w and y+h <= 1, photo a non-negative integer; tests added
R42-03 fixed — scan stage also requires mode === "photo"; test added
R42-04 fixed — stage always shows photo 0, remaining photos in a strip under it; test added
R42-05 fixed — hard-coded contrast test removed from Darkroom.test.tsx; checks now read the real tokens in tokens.test.ts
R42-06 fixed — region boxes get a dark stage outline inside and out so they read over any photo
R42-07 fixed — tests for object URL revoke, title typing and sr-only title, reduced motion, stop waiting, bad regions, long confidence/rows, 3 photos (f, the ai_disabled flow, was already covered at ImportScreen.test.tsx)
R42-08 fixed — untyped remainder rendered invisible so the title keeps its space
R42-09 fixed — warning key is the index
R42-10 skipped — nice, mapping already correct
R42-11 fixed — API.md no longer names UI colours; openapi.json left alone as the review says
R42-12 skipped — ownership note belongs in the PR
R42-13 fixed — root causes covered by O42-01, O42-03, O42-04, O42-05
