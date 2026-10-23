# Integration + web-interface review, issue #40 (R5 + V)

Artefacts: /tmp/claude-0/-home-claude/5ceb3048-0989-5a26-a02e-2582ab8ecc6b/scratchpad/r5/ (live.py, logic.ts, screenshots, print PDFs)

## Checks
| Check | Result |
|---|---|
| npm run lint | pass (0 errors, 1 warning in generated coverage/block-navigation.js, not source) |
| tsc --noEmit | pass |
| vitest run | pass, 38 files, 595 tests |
| Console errors/hydration warnings, 4 recipes + missing id | none |
| One h1, heading order | pass (h1, h2 Ingredients, h3 sections, h2 Method, h3 sections) |
| Landmarks | pass: aside labelled "ingredients", section labelled "steps", nav, main |
| Tick by click, Space, Enter | pass (aria-pressed buttons); bar count updates |
| Reload restores ticks; other recipe separate | pass (sessionStorage recipe-ticks:<id>) |
| Scale 2x / half: quantities + Serves | pass (Serves 4 -> 8 -> 2); scale PERSISTS across reload (recipe-scale:<id>) |
| Scale radiogroup keyboard | pass (arrow moves selection); polite status "Scaled to 2x" |
| Mention link jumps to row | jumps; NO focus or highlight (see INT-6) |
| Touch targets < 44px | fail: inline mention links 20px high (INT-6); radios are sr-only inputs inside 44px labels (ok) |
| Reduced motion | pass: getAnimations() empty after scale + tick; photo-turn gated by no-preference |
| Print light and dark | bar, scale, checkboxes hidden, white page, #333 text; FAIL layout of qty column (INT-1) |
| Floating bar vs last content (390px) | pass: content bottom 631 vs bar top 753, pb 112px, safe-area calc present |
| scrollY on load | 0 |
| Horizontal overflow at 390 | none (all four recipes) |
| Card -> recipe -> Back | pass |
| Missing id | renders "Page not found" but HTTP status 200 (see INT-9) |

## e2e selector risk (not run)
- e2e/tests/web/recipe.spec.ts:35 `getByText("500 g mince")`: row is now three spans (qty / rest) with no space between, so textContent is "500 gmince" and the match fails. Likely BREAK.
- e2e/tests/web/import.spec.ts:24 `getByText("Roast the tomatoes and garlic for 90 minutes.")`: the timer chip adds an aria-hidden label, so the paragraph's text is "...for 1 hr 30 min90 minutes." (live step_text shows "15 min15 minutes"). Likely BREAK.
- Heading, Edit, Delete, "Start cooking" selectors: no e2e test uses "Start cooking"; the page now has two such links (opener + bar), so any future getByRole("link",{name:"Start cooking"}) hits strict-mode.

## Findings
**INT-1 Must** `components/ui/IngredientPanel.tsx` (IngredientRow grid `grid-cols-[1.25rem_5.25rem_minmax(0,1fr)]`, checkbox `print:hidden`). Print: hiding the checkbox leaves the grid at 3 columns, so quantity falls into the 1.25rem column and wraps by letter ("ts/p", "cu/ps", "cl/ov/e", "1/ 2"). See print_light_v.png. Fix: add `print:grid-cols-[5.25rem_minmax(0,1fr)]` on the button, or `print:grid-cols-[auto_1fr]`.

**INT-2 Must** (e2e) recipe.spec.ts:35 and import.spec.ts:24, above. Fix: update tests to `getByRole("listitem").filter({hasText:"mince"})` and match step text by a fragment outside the chip ("Roast the tomatoes"). Optionally put a space between qty and rest spans (also fixes copy/paste "500 gmince").

**INT-3 Should** `lib/scale.ts:12` QUANTITY lookahead allows a comma. "1,000 g flour" x2 -> "2 ,000 g flour"; "1,5 kg" x2 -> "2 ,5 kg". Expected unchanged (or 2,000 g). Fix: drop `,` from the lookahead when followed by a digit: `(?=\s|,(?!\d)|$)`.

**INT-4 Should** `lib/scale.ts` mixed number with hyphen: "1-1/2 cups flour" x2 -> "2–1 cup flour" (read as range 1 to 1/2). Expected "3 cups". Fix: make NUMBER try `\d+-\d+/\d+` first (normalise to mixed).
Related: "1 1/2-inch piece ginger" x2 -> "2 1/2-inch piece" (corrupt; documented shortcut, but silent). Fix: lookahead `(?!/|\d*-?inch)`, or treat a number followed by a hyphenated word as unparseable.

**INT-5 Should** `lib/scale.ts` splitIngredient/scaleIngredient: "2 cups plus 2 tbsp flour" x2 -> "4 cups plus 2 tbsp flour" (second amount unscaled; wrong recipe). "1 cup/240 ml milk" x2 -> "2 cup/240 ml milk" (the unit at the cup is not read, metric half unscaled). Expected: leave the line untouched when a second quantity follows ("plus", "/", "+"). Fix: after the match, if the rest matches `^(\s*(plus|\+|\/|and)\s*\d|\/\s*\d)`, return the text unchanged.

**INT-6 Should** `components/ui/Method.tsx:30` IngredientMention. Click "ribs" -> hash set, scroll happens, but activeElement stays BODY and the row has no highlight, so the jump is silent and the reader cannot see which row. Also link box is 20px high (<44px). Fix: `:target` style on `li[id^=ingredient-]` (background tint, colour only) in components.css; optionally focus the row button via onClick; add vertical padding (`py-2.5 -my-2.5`) to enlarge the hit area.

**INT-7 Should** `lib/scale.ts` unit/count pluralisation. "1 egg" x2 -> "2 egg"; "2 onions" half -> "1 onions"; "2 sprigs thyme" half -> "1 sprigs"; "1 bay leaf" x2 -> "2 bay leaf"; "2 14-oz cans beans" half -> "1 14-oz cans"; "1 (14 oz) can tomatoes" x2 -> "2 (14 oz) can tomatoes". Live "1 clove" x2 -> "2 cloves" works because clove is a listed unit. Expected: units pluralise; nouns after a number need a "plural-safe" rule. Smallest fix: add sprig(s), head(s), piece(s), stalk(s), package(s) to UNIT and pluralize; for bare counts leave noun alone (accept) but note it.

**INT-8 Should** `lib/scale.ts` fractions are only normalised when scaled: at 1x the live page shows "1/2 cup parsley" but at 2x "1 cup" and half "¼ cup". #14 asks fractions to render nicely; 1x line is raw text. Also 1/3 half -> "⅛" (true 1/6) and 1/4 half -> "⅛" fine. Fix: run `scaleQuantity` formatting at 1x too (format only), or document that 1x shows source text. Also "1⁄2 cup" (U+2044 fraction slash) is not parsed at all (quantity null, untouched, so safe but unscaled). Fix: normalise "⁄" to "/" before matching.

**INT-9 Should** `app/(app)/recipes/[id]/page.tsx:46` loadRecipe notFound(): live `GET /recipes/<unknown uuid>` returns HTTP 200 with the not-found UI (streamed). Same behaviour as before the diff? Not verified against main; report to orchestrator. Fix if new: ensure `not-found.tsx`/Suspense boundary does not stream before notFound().

**INT-10 Should** `lib/recipe.ts:62` (splitDurations label). "1 1/2 minutes" -> label "2 min" (rounds), expected "1 min 30 sec" or "1½ min". Fix: for minutes < 5 non-integers format with formatNumber, e.g. `${formatNumber(minutes)} min`.
Also "5-minute rest" and "30-minute" (hyphenated adjective) get no chip; "1:30" none. Acceptable, note for #24. Duration chips pass: "1 hr", "5 to 10 seconds", "10-12 min.", "1 hour 30 minutes", "2 hrs 15 min"; "350°F" and "overnight" correctly ignored.

**INT-11 Nice** `lib/scale.ts:36` formatNumber: 0.4 -> "⅜"; 0.0x -> "⅛" ("0 cups" -> "⅛ cup"); ≥10 rounds whole so 12.5 -> "13". "500g" x2 -> "1000 g" (no thousands grouping; fine). 3 eggs half -> "1½ eggs" (fine).

**INT-12 Nice** `components/recipe-page/mentions.ts` ingredientNames: "1 tbsp sesame oil"/"2 tbsp olive oil" both answer to "oil"; documented shortcut. "1 can (14 oz) tomatoes" and "1 (14 oz) can tomatoes" give no name (empty before "("), so steps never link them. Fix: when the pre-bracket name is empty, use text after the bracket.

**INT-13 Nice** Timer chip text duplicates in textContent ("15 min15 minutes"); copy/paste and find-in-page see both. Fix: render the label via CSS `content: attr(data-label)`, keep the words as real text.

## Web interface guidelines (relevant items)
| Item | Result |
|---|---|
| Visible focus on buttons/radios/links | pass (2px solid ring on row; radio peer-focus-visible) |
| Labels and names: radiogroup "Scale", aria-pressed rows | pass (rows are toggle buttons, not checkboxes; acceptable) |
| Live regions | pass (status for scale, bar); two status regions ok |
| Heading hierarchy | pass |
| Touch targets 44px | rows, scale, bar action, Start cooking pass; inline mention links fail (INT-6) |
| Reduced motion | pass |
| Print | fail on layout (INT-1), otherwise pass |
| Contrast | token tests cover new tokens; ticked text #333 in print ok |
| No horizontal scroll at 390 | pass |
| safe-area inset | pass (env(safe-area-inset-bottom)) |
| Tabular numerals on quantities | pass |
| Hover-only affordances | none |
