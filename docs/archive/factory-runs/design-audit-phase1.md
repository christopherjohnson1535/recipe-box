# Design audit, issue #9 (Phase 1 review)

Branch `issue-9-phase1-review`. Screenshots: `shots/qa-before/` (gitignored; `<scheme>-<page>-<size>.png`, sizes `desktop` 1440,
`ipad` 820, `ipad-landscape` 1180, `phone` 390). Extra states shot for this audit with the same naming:
`*-import-review-*` (link import, `/api/import/url` route-fulfilled with a pumpkin-gnocchi `RecipeDraft` with warning,
two sections, source), `*-settings-admin-*` (signed in as admin), `*-undo-toast-{ipad,phone}`,
`*-editor-typed-*` and `*-editor-restore-*` (new-recipe editor with a stashed draft offered back).
`shoot.py` printed no WARN lines (no scroll-on-load, no horizontal overflow).

Viewed: light home, home-tag, home-q, recipe, edit, cook, login, import-link, import-review, settings-admin and undo toast at
iPad and phone as relevant; dark home and recipe at desktop and iPad, dark import review at desktop, dark settings at phone.
Read mode = home and recipe. Operate mode = editor, import, settings, toast.

## Verdict

**Pass with polish; the direction holds, the Operate screens are the weak side.** Read mode is genuinely good: the recipe page
(`light-recipe-ipad.png`, `dark-recipe-ipad.png`) reads like a magazine article, with a calm kicker/headline/deck/byline stack,
accent numerals, a tinted ingredient sidebar and one red accent. The home contents (`light-home-ipad.png`) is clean on iPad.
What a reviewer sees first, and what is still wrong:

1. **Home desktop has holes and a long preamble.** The two-column grid stretches rows to the tallest neighbour, leaving a
   160 px void under "Lemon drizzle cake" and a half-empty right column (`light-home-desktop.png`, `dark-home-desktop.png`).
   Before the first result there are head, buttons, search, sort and tag rows: 600 px on desktop, 740 px on phone
   (`light-home-phone.png`).
2. **Filtered views leave a blank deck-sized gap under "Recipes"** (`light-home-tag-ipad.png`, `light-home-q-phone.png`) while the
   result count sits below the chips.
3. **The editor is dense and partly unreadable.** Every ingredient or step row is a full-width field plus a row of three
   icon buttons underneath, so five ingredients take 400 px. Step and description textareas are a fixed height and clip text
   mid-line (`light-edit-phone.png`: steps 2, 3 and 5; `light-import-review-phone.png`: description). A focus ring boxes the
   whole "Check the recipe" heading across the page (`light-import-review-ipad.png`, `dark-import-review-desktop.png`).
4. **Wrapped metadata orphans dots** on phone: byline `OCT 21, / 2026 ·`, meta strip `PREP 15 MIN ·`, kicker
   `DINNER · VEGETARIAN · / WEEKNIGHT` (`light-recipe-phone.png`, `light-home-phone.png`).
5. **One possible functional bug seen in the toast shot**: while the "Deleted" toast is up the home list still shows the deleted
   "Temp toast recipe" row and counts "6 recipes" (`light-undo-toast-ipad.png`). Verify before design work (Q1-01).

No locked-direction violation found: two serif families, one accent, hairlines, square controls, no shadows, no gradients. Both
dark pages hold the hierarchy (`dark-recipe-desktop.png`). From the #2 audit, D-01, D-05 (see Q1-03), D-12 and D-14 are visibly
resolved or reworked; D-02, D-03, D-09, D-15 to D-18, D-21 are still open and are folded in below.

## Critique (impeccable, by mode)

**Read mode (home, recipe)**
- *Hierarchy.* Strong on the recipe page. On home the filled "Add recipe" slab is still the highest-contrast object, above the
  recipes (`light-home-ipad.png`); in dark it becomes a bright cream slab (`dark-home-desktop.png`). Five red entry kickers in a
  column make the accent about 10 percent of the list, over the 5 percent budget.
- *Type.* Deck, body and display are right. One label voice (14 px, 600, tracked caps) carries nav, chips, kickers, meta,
  buttons and field labels, so the chip row (`ALL BAKING 2 BREAD 1`) and the meta line compete. Chip counts are as heavy as names.
- *Rhythm and alignment.* Desktop recipe: masthead and head rule span 184 to 1256, photo and sidebar 208 to 1232, method ends
  1176 (`dark-recipe-desktop.png`), three edges. Method lines run about 85 characters at desktop. "TO SERVE" sits 16 px under
  the previous step but 32 px above its own steps (`light-recipe-ipad.png`).
- *Phone.* Delete wraps alone onto a third action line; byline and meta strip break with trailing dots
  (`light-recipe-phone.png`). The sort select drops to its own row (`light-home-phone.png`).

**Operate mode (editor, import review, settings, toast)**
- *Efficiency.* Per-row controls under each field double the height of every row; section rows show Section/arrow buttons at
  inconsistent indents (`light-import-review-ipad.png`: "SECTION" starts 10 px right of the arrows' left edge, the first row of a
  section has no Section button, a heading's left rule is a barely visible hairline).
- *Clarity.* The unsaved-draft banner (`light-editor-restore-ipad.png`) is clear and well placed. Warning alert on review is good.
  Section headings in the form are indistinguishable from ingredient inputs apart from a 3 px hairline.
- *Layout.* On iPad and desktop the form column is 38 rem and the right 36 to 60 percent is empty while the page head rule runs
  full width; the "Check the recipe" rule also runs full width beside a narrow form (`dark-import-review-desktop.png`).
- *Settings.* Orderly and well labelled, but long: password form, add-member form and AI note are all always open
  (`light-settings-admin-ipad.png` is 2100 px). NAME/USERNAME labels sit 6 px above their values' baseline. "Remove" floats
  18 px inside the right rule. On phone dark it is correct and legible (`dark-settings-admin-phone.png`).
- *Toast.* Well judged: inverse bar, hairline, 44 px actions, curly quotes (`light-undo-toast-phone.png`). On iPad it floats
  centred at 600 px over the list rather than aligning to the column; fine, but it needs a bottom safe-area offset.

## Refactoring UI pass

- **Hierarchy.** Demote the home actions (move top-right of the headline row, secondary + ghost) and chip counts; promote the
  recipe titles (hover underline). In forms, make section headings visibly different from inputs (italic label with a rule).
- **Spacing.** Group related: search + sort + tags 12 px apart, 40 px before the list, 24 px inside rows, 48 px between groups.
  Editor row gaps 24 px between rows, 8 px inside; shorter rows via inline controls.
- **Type.** Split the label voice: weight 500 for chips, nav and meta, 600 only for buttons, field labels and kickers. Method
  measure to about 34 rem. Numerals 32 px.
- **Colour.** Entry kickers go muted ink; accent stays for page kicker, links, numerals, active underline, focus. Dark double
  rule goes from full cream to muted. Dark sidebar a step lighter.
- **Depth.** No shadows by direction; the only separators are hairlines, one double rule and paper-deep. Keep.

## Change list

Targets are exact. Pages may use layout utilities only, so styling lives in tokens or `frontend/src/components/ui/*`; page
edits below are props, copy or layout classes. "Guards" = whether `src/styles/*.test.ts` and `page-styling.test.ts` stay green.
New component tokens must point at a semantic token and be read by a ui component; any `-fg`/`-bg` token needs a pairing in
`tokens.test.ts`.

### P0

- **Q1-01 (P0) Verify: deleted recipe still listed while the Undo toast shows.** Page/store, not visual. After
  `DeleteRecipeButton` deletes and goes home, `/` must not render the deleted recipe or count it (`light-undo-toast-ipad.png`:
  "6 recipes" and a "Temp toast recipe" row with no kicker). Likely cached RSC or navigation before refresh: `router.refresh()`
  after the delete resolves or `router.replace("/")` + `refresh`. Light and dark. Guards: unaffected. If it was a screenshot-timing
  artefact (700 ms), close as not a bug.
- **Q1-02 (P0) Textareas clip their text.** `ui/Textarea.tsx`: add `[field-sizing:content] min-h-[5.5rem]` (steps and
  description min 3 lines = 5.5 rem; notes min 4 lines = 7 rem via existing rows) and `resize-y`; fallback for browsers
  without field-sizing is the current rows. Shown in `light-edit-phone.png` (steps 2, 3, 5), `light-import-review-phone.png`
  (description). Same light and dark. Guards: green (no colour).
- **Q1-03 (P0) Contents grid holes.** `ui/Contents.tsx`: replace `grid ... lg:grid-cols-2` with `lg:columns-2 lg:gap-x-14` on the `ul`
  and `break-inside-avoid` on each `li`; drop `h-full` on the `article`. Rows then flow independently, no void under tall
  neighbours. Reading order becomes down each column (acceptable for a contents page; sort still applies top to bottom). Keep a
  top hairline per entry. Shown in `light-home-desktop.png`, `dark-home-desktop.png`. Guards: green.
- **Q1-04 (P0) Focus ring boxes the result heading.** `ui/Heading.tsx`: when `tabIndex={-1}` (programmatic focus target) add
  `focus:outline-none`; keep the 2 px ring on every interactive element. The h1 and "Check the recipe" must not draw a full-width
  box. Light and dark. Shown in `light-import-review-ipad.png`, `dark-import-review-desktop.png`. Guards: green. a11y note: focus
  still lands on the heading for screen readers.
- **Q1-05 (P0) Filtered head gap.** `app/(app)/page.tsx` + `components/search/ResultSummary`: when a tag or query is active pass
  the summary ("2 recipes tagged baking", "3 recipes match “lemon”") as the PageHeader `description` and remove the separate
  summary line and `reserveDeck`; unfiltered keeps "5 recipes in your household's box." No 48 px hole, no extra row. Both
  schemes. Shown in `light-home-tag-ipad.png`, `light-home-q-phone.png`. Guards: green (props only).
- **Q1-06 (P0) Phone: sort select wraps alone and chips take 4 rows.** (a) `ui/Select.tsx`/search row: below `sm` the search row is
  `input (flex-1) + Search`, and the sort select sits on the result-summary line (right-aligned, `min-h-control`, borderless
  label-style with a 1 px `--color-rule-strong` underline) at all sizes; saves one 60 px row. (b) `ui/Chip.tsx`: add `ChipDisclosure`
  used below `sm`: a `<details>` whose summary reads `TAG: ALL` or `TAG: BAKING 2` (44 px, chevron `+`/`−`), content is the
  existing wrapped chips; `sm` and up render the chips open as now. Before-first-result height on phone drops from 740 px to
  about 430. Light and dark. Shown in `light-home-phone.png`, `light-home-q-phone.png`. Guards: green (existing tokens).

### P1

- **Q1-07 (P1) Editor row controls inline at iPad and desktop.** `ui/ListEditor.tsx` `EditorItem`: from `sm` use
  `flex-row items-start gap-2`: field `flex-1`, controls `shrink-0` in a vertical-centred `flex gap-1` to its right (44 px each
  kept). Phone keeps controls below but with `gap-1` (4 px) instead of 8 px and list gap 24 px to 16 px (`EditorList`
  `gap-6` to `gap-4 sm:gap-6`). Halves ingredient list height on iPad. Shown in `light-import-review-ipad.png`,
  `light-edit-phone.png`. Guards: green.
- **Q1-08 (P1) Section button alignment and heading rows.** `ui/Button.tsx` ghost: `px-0` when `size="inline"` (or add a ui
  `RowButton`) so "SECTION" aligns with the arrows' left edge, not 10 px in. Section heading wrapper in `EditorItem`: left rule
  `border-l-[3px] border-(--rule-strong-decor)` with new token `--editor-heading-rule: var(--color-rule-strong)` (light `#8c8377`,
  dark `#7a7064`; control-level 3:1 met) and heading input italic (`italic text-ink-muted`, label above it not needed). Shown
  in `light-import-review-ipad.png` (rows 2, 3, 5). Guards: green (token to a semantic colour).
- **Q1-09 (P1) Form column and rule widths.** `ui/Heading.tsx` `ruled`: the rule ends at the form measure when inside `max-w-measure`
  (it already stops at the column edge; make the review's heading wrapper `max-w-measure`, the same container as the form, in
  `import/ImportScreen.tsx`, a layout class). At `lg` allow the editor measure 44 rem: add `max-w-form` = 44rem token
  `--measure-form` in `globals.css`. Light and dark. Shown in `dark-import-review-desktop.png`, `light-editor-restore-ipad.png`.
  Guards: green.
- **Q1-10 (P1) Home actions demoted.** `ui/PageHeader.tsx`: new prop `actionsPlacement="inline"`; at `md` and up the header is a
  two-column grid (title left, actions right, `items-end`, `gap-6`), deck below the title; below `md` actions stay under the deck.
  `app/(app)/page.tsx`: "Add recipe" `variant="secondary"`, "Import" `ghost` (this was D-09). Removes the black slab, saves 56 px
  before the search. Recipe page keeps one filled "Start cooking". Both schemes (dark slab goes too). Shown in
  `light-home-ipad.png`, `dark-home-desktop.png`. Guards: green.
- **Q1-11 (P1) Entry kickers quiet.** `ui/Contents.tsx`: kicker wrapper `text-(--entry-kicker-fg)`; add
  `--entry-kicker-fg: var(--color-ink-muted)` in `components.css` (light `#5c554c`, 6.93:1; dark `#b3a999`, 7.98:1). Page kicker,
  recipe-page kicker stay accent. Cuts accent from five red lines to one. Shown in `light-home-ipad.png`. Guards: green (add
  pairing `entry-kicker-fg/paper` to the contract).
- **Q1-12 (P1) Phone metadata without orphan dots.** `globals.css` `.dot-list` (ui helper): below 480 px for `align="center"`
  lists (`MetaStrip`, byline) switch to `display:grid; justify-items:center; row-gap:.25rem` and hide the dot
  (`.dot-list > *::after{content:none}`), so "SERVES 4 / PREP 15 MIN / COOK 40 MIN / TOTAL 55 MIN" stacks two by two
  (`grid-template-columns:repeat(2,auto)` for the meta strip) and the byline puts Source on its own line. Light and dark. Shown
  in `light-recipe-phone.png`. Guards: green.
- **Q1-13 (P1) Listing kicker clamped.** `components/RecipeCard.tsx` passes at most the first two tags to `kicker`; `ui/Contents.tsx`
  kicker wrapper `truncate` (one line, ellipsis) so `DINNER · VEGETARIAN · WEEKNIGHT` never wraps with a trailing dot. Shown in
  `light-home-phone.png` (last entry). Guards: green. (Left as a design call in #9 R5 N-4; this resolves it without changing
  `.dot-list`.)
- **Q1-14 (P1) Recipe column edges at desktop.** `ui/Article.tsx`: figure and sidebar/method grid use `max-w-page` (same 184 to
  1256 as masthead and head rule, no extra `max-w-measure-wide` inset). Grid `lg:grid-cols-[19rem_minmax(0,1fr)] gap-14`, with the method text capped by Q1-15. Shown in
  `dark-recipe-desktop.png` (photo 208 vs rule 184). Same light and dark. Guards: green.
- **Q1-15 (P1) Method measure.** `ui/Article.tsx` `StepList`: step text `max-w-[34rem]` (about 62 characters at 19 px; now about 85).
  Shown in `dark-recipe-desktop.png`. Guards: green.
- **Q1-16 (P1) Recipe phone actions.** `ui/Article.tsx` / head actions: on phone "Start cooking" full width (`w-full sm:w-auto`),
  Edit and Delete share the next row (`grid grid-cols-2`, Delete ghost centred) so Delete no longer wraps alone
  (`light-recipe-phone.png`). Page passes layout classes only. Guards: green.
- **Q1-17 (P1) Dark double rule too bright.** `components.css` dark block: `--rule-double: var(--color-ink-muted)` (`#b3a999`,
  7.98:1 on paper; decorative). Light unchanged `#1a1714`. Shown in `dark-home-desktop.png`, `dark-recipe-ipad.png` (masthead
  and sidebar top). Guards: green (points at a semantic token).
- **Q1-18 (P1) Dark primary button less glaring.** Keep the dark fill (ink on paper is the contrast pair) and drop mass: `ui/Button.tsx` primary
  `px-5` to `px-4`. Combined with Q1-10 this removes the cream slab from home; recipe
  "Start cooking" and "Save" keep it (`dark-recipe-ipad.png`, `dark-import-review-desktop.png`). Guards: green.
- **Q1-19 (P1) Settings baseline and Remove alignment.** `ui/DetailList.tsx`: `items-baseline` on each row and `gap-x-6`;
  `ui/MemberList.tsx` action cell `-me-0` so "Remove" ends on the rule edge (now 18 px inside). Shown in
  `light-settings-admin-ipad.png`. Guards: green.
- **Q1-20 (P1) Chip and nav label weight.** `globals.css` add `.label-quiet` (weight 500, tracking .1em); use in `ui/Chip.tsx`
  and `ui/Masthead.tsx` nav (selected 600); chip count `font-weight:400` in `text-ink-muted`. Contrast unchanged (ink-muted).
  Shown in `light-home-ipad.png` (chip row). Guards: green.

### P2

- **Q1-21 (P2) Settings shorter.** `settings/*`: "Change password" and "Add a member" start collapsed behind a ghost button that
  opens the form in a `ui/Panel` (open when there is an error or focus). Page length iPad 2100 to about 1200 px. Shown in
  `light-settings-admin-ipad.png`. Guards: green; behaviour: keep focus return rules.
- **Q1-22 (P2) Sidebar in dark.** `themes/evening.css` paper-deep `#211c17` to `#241f19` (ink 14.6:1, ink-muted about 6.9:1, rule-strong
  `#7a7064` about 3.3:1 on it); keep the `tokens.test.ts` expectations, run the matrix. Shown in `dark-recipe-ipad.png`. Light none.
- **Q1-23 (P2) Sub-section spacing.** `ui/Article.tsx` method subsection heading `mt-8 mb-3` (now about 16/12). Shown in
  `light-recipe-ipad.png` ("TO SERVE"). Guards: green.
- **Q1-24 (P2) Numerals.** `globals.css` `--text-numeral` 28 px to 32 px. Shown in `light-recipe-ipad.png`. Guards: green.
- **Q1-25 (P2) Toast safe area and offset.** `ui/Toast.tsx` region `bottom-4 pb-[env(safe-area-inset-bottom)]`, `max-w-measure`,
  on `sm` align to the page column (`left-1/2 -translate-x-1/2` kept, width `min(100%-2rem, 38rem)`). Light and dark identical.
  Shown in `light-undo-toast-ipad.png`. Guards: green.
- **Q1-26 (P2) Ghost "start over" alignment.** `ui/Button.tsx` ghost `px-0`, and `max-sm:text-left` so it lines up with the
  fields and its two-line wrap does not centre (`light-import-review-phone.png`, `light-import-review-ipad.png`). Guards: green.
- **Q1-27 (P2) Login frame and balance.** `ui/Card.tsx` auth variant `p-10`, auth wrapper `pt-[14vh]` rather than centred; frame stays
  `--card-border` (decorative). Shown in `light-login-ipad.png`. Guards: green.
- **Q1-28 (P2) Placeholder pages.** `ui/EmptyState.tsx`/shell `min-h-[60vh]`, requirement tokens `KIT`/`REC` not bold (`font-normal
  tracking-[0.08em]`). Shown in `light-cook-ipad.png` (a Phase 2 page, so only if cheap). Guards: green.
- **Q1-29 (P2) Chip row group spacing.** `ui/Chip.tsx` `ChipRow` `mt-3` from the search row (12 px) and `mb-10` to the first result
  (now 24); with Q1-06 the home head groups as 24 / 12 / 40. Shown in `light-home-ipad.png`. Guards: green.

## Not changed (confirmed fine)

Palette matrix and 44 px targets, focus ring on interactive elements (verify in the after pass), square controls, no shadows,
two serif families, the toast contrast and hairline, the Restore/Discard banner, the Alert warning, tab underline on import,
settings on phone dark, login composition. Remaining placeholder pages (cook) belong to Phase 2.
