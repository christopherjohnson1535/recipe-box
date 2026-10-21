# Design audit, issue #2 (design system)

Branch `issue-2-design-system`. Screenshots: `shots/build/` (`<scheme>-<page>-<size>.png`; sizes `desktop` 1440, `ipad` 820,
`ipad-landscape` 1180, `phone` 390; extra states `<scheme>-home-tag-ipad.png`, `<scheme>-home-nomatch-ipad.png`).
Viewed: every page in light at iPad, home and recipe in dark at all four sizes, light home and recipe on phone, login
light and dark, the two extra home states in light and dark. Setup-redirected login is the same `/login` screen
(`light-login-ipad.png`); no separate setup view exists in this build.

## Verdict

Pass with polish. The editorial direction is clearly present and coherent: Libre Caslon Display headlines, Newsreader
body, tracked small caps, one claret accent, hairlines, square controls, no shadows, no sans. The recipe page
(`light-recipe-ipad.png`) and the home contents (`light-home-ipad.png`) read as a magazine, dark mode
(`dark-recipe-desktop.png`) holds the same hierarchy, and nothing is scrolled on load or overflowing. Remaining weaknesses
are alignment and rhythm, not style: the tag index runs off the column and is clipped, the recipe photo is inset from the
column rules, the two-column contents grid leaves dead space, trailing middle dots orphan at line ends, the placeholder
pages are very empty, and hairlines are faint. No locked-direction violations found. No P0 blockers to function; the
P0s below are visible defects a reviewer will notice immediately.

## shoot.py WARN lines

None. The run printed only `done shots/build` (no scrolled-on-load, no horizontal overflow at any page, scheme or size).
Note the script cannot see element-level clipping, which is where D-01 lives.

## Critique (impeccable, Read mode for home and recipe)

- **Hierarchy.** Clear: kicker, headline, deck, actions, then rule. On the recipe page the order of kicker, title, deck,
  byline, actions, meta strip is strong. On home, the two buttons directly under the deck compete with the headline for
  first read; "Add recipe" is a heavy black slab (`light-home-ipad.png`) and is the highest-contrast object on the page,
  above the recipes, which are the content.
- **Type.** Headline at 72px with 1.05 line height is good. Body 19px is comfortable. The 22px italic deck in muted ink is
  attractive. Label style (14px, 600, +0.12em) is used for nav, kickers, meta, buttons, chips and field labels alike, so
  six roles share one voice; metadata bold numerals ("SERVES **4**") help but chips and nav are visually identical to meta.
- **Rhythm and alignment.** Recipe photo spans 208 to 1232 at desktop while the head rule and masthead span 184 to 1256
  (`dark-recipe-desktop.png`); ingredients and method sit inside the photo's edges. Three different left edges in one
  view. Home desktop contents leaves a 150px void under the first entry because rows stretch to the tallest neighbour
  (`dark-home-desktop.png`).
- **Tag index.** Overruns: "WEEKEND 1" ends at x=1298, past the 1256 column (`dark-home-desktop.png`); at iPad "QU" is
  cut at the viewport edge (`light-home-ipad.png`) and on phone "BREAKFAST" is cut (`light-home-phone.png`). Scrolling
  is silent, so users cannot know more tags exist.
- **Trailing dots.** `DINNER · VEGETARIAN ·` ends a line with a dot and `WEEKNIGHT` wraps alone
  (`dark-home-desktop.png`, `light-home-phone.png`), and the recipe meta strip wraps as `PREP 15 MIN ·` / `COOK 40 MIN`
  on phone (`light-recipe-phone.png`).
- **Empty space and placeholders.** The five "Not built yet" pages (`light-cook-ipad.png`, `light-edit-ipad.png`,
  `light-import-ipad.png`, `light-settings-ipad.png`, `light-new-ipad.png`) use 55% of the viewport as blank paper, and the
  bold "KIT"/"REC" tokens in the deck are the only 600-weight body text in the app, so they look like a different style.
- **Colour.** Restrained and correct. Accent appears on kickers, numerals, links and the active underline; it is
  perhaps slightly over-used on the home page where every entry has a red kicker (five red lines in a column).
- **States.** Tag filter state shows "2 MATCHES" (`light-home-tag-ipad.png`) but the only difference between selected and
  unselected chip is ink versus muted colour plus underline; the filtered state loses the deck line, so the header
  jumps 48px. No-match state (`light-home-nomatch-ipad.png`) is calm and clear but the entered "zzz" is 16px sans-like
  small text compared with the placeholder (italic 19px), so the input reads as two styles.
- **Auth.** Login (`light-login-ipad.png`, `dark-login-ipad.png`) is well composed; the form frame hairline is very faint.
- **Phone.** Masthead stacks wordmark above nav with the active underline starting left of the gutter
  (`light-home-phone.png`: underline at x=8, text at x=16). Search placeholder truncates to "lasagne..". Titles
  clamp to three lines with an ellipsis mid-word ("foo...").

## Refactoring UI pass

- **Hierarchy.** Demote the secondary actions and chips, promote the content. De-emphasise "Import" (already outline) and
  reduce "Add recipe" mass; give the entry title a hover/underline cue. Make selected chips distinguishable without colour.
- **Spacing.** Rows use 24px padding; the home head gap (title to buttons 32px, buttons to rule 32px, rule to search 32px)
  is even but not grouped: related things (search + tags) should sit closer to each other than to the head. Use 24 inside
  group, 48 between groups.
- **Type.** One label style for six roles; split by size/weight, not by new families. Deck and body are good.
- **Colour.** Hairlines (`--color-rule`) are about 1.4:1 on paper and about 1.5:1 in dark; legitimately decorative but
  too faint on iPad glare to hold the layout. Slightly strengthen.
- **Depth.** No shadows by direction; use double rule and paper-deep only. Photo in dark mode is the brightest object by
  far; dim slightly.

## Change list

Targets are exact. Page code may use only ui components and layout utilities, so styling fixes go in tokens or
`components/ui/*`. Contrast changes keep text at 4.5:1 and controls at 3:1; values below were chosen to do so.

### P0

- **D-01 (P0) Tag index clips and overruns.** `frontend/src/components/ui/Chip.tsx` and the page container that wraps
  chips (add a `ChipRow` export in `ui/Chip.tsx`, used by home). Wrap instead of scroll: `flex flex-wrap gap-x-4
  gap-y-0` (no horizontal scroll) at every width, each chip keeps `min-h-control`. Same light and dark. Shown in
  `dark-home-desktop.png` (ends x=1298 vs column 1256), `light-home-ipad.png`, `light-home-phone.png`.
- **D-02 (P0) Photo and body edges disagree with the column.** `ui/Article.tsx`: make the photo figure, the
  ingredients/method grid and the notes share the head's column (`max-w-page` inside `px-gutter`, no extra `max-w-measure-wide`
  inset). Target: photo, head rule, sidebar left edge and method right edge all at 184/1256 on desktop, 40/780 on iPad.
  Light and dark. Shown in `dark-recipe-desktop.png`, `dark-recipe-ipad-landscape.png`.
- **D-03 (P0) Orphan trailing dots.** `components.css`/`globals.css` `.dot-list`: replace the trailing `::after`
  with a leading dot that is hidden on wrap: items `display:inline-block`, separator `::before` content `"·"` with
  `margin-inline: 0 0.5em`, and use `.dot-list { display:flex; flex-wrap:wrap; column-gap:0.9em; row-gap:0.15em }`
  with the dot as `::before` positioned `left:-0.65em` (`position:relative`), first child no dot. Wrapped lines then start
  with a word, never a dot. Shown in `dark-home-desktop.png` (DINNER · VEGETARIAN ·), `light-recipe-phone.png`.
- **D-04 (P0) Placeholder pages leave most of the screen blank.** `ui/EmptyState.tsx` and `ui/Article.tsx` page shell:
  give the main region `min-h-[60vh]` and vertically start the empty state at 96px (`pt-24`) under the hairline;
  restyle the requirement tokens (`KIT`, `REC`) from 600 weight to `font-normal not-italic tracking-[0.08em]` small caps
  via `ui/Text.tsx` so they stop reading as bold. Light and dark. Shown in `light-cook-ipad.png`, `light-import-ipad.png`.

### P1

- **D-05 (P1) Two-column contents leaves dead space.** `ui/Contents.tsx`: replace `grid` rows with CSS columns
  (`lg:columns-2 lg:gap-x-14`) and `break-inside-avoid` on each entry so the right column flows from top and rows stop
  stretching; keep top hairlines. Shown in `dark-home-desktop.png` (void under Lemon drizzle cake).
- **D-06 (P1) Selected chip relies on colour.** `ui/Chip.tsx`, tokens `--chip-fg-selected` and the selected class: add
  `font-bold`-equivalent via `[font-weight:700]` and `border-b-[3px]` for selected (idle stays 2px transparent so no
  layout shift: use `border-b-[3px]` on both). Light: ink `#1a1714` on paper; dark: ink `#efe8da`. Shown in
  `light-home-tag-ipad.png`.
- **D-07 (P1) Hairlines too faint.** `frontend/src/styles/primitives.css` and themes. Light `--cream-300` from `#d9d1c3`
  to `#cdc3b0`; dark `--umber-700` from `#3a332b` to `#463e33`. Still decorative only; update the guard-test list in
  `tokens.test.ts` expectations if it pins the hex. Shown in `light-login-ipad.png` (frame), `dark-login-ipad.png`.
- **D-08 (P1) Dark photo glare.** `ui/Article.tsx` figure img and `ui/Contents.tsx` thumbnail: add a token
  `--image-filter: none` (day) and `brightness(0.9) contrast(1.02)` (evening) in `themes/*.css`, applied with
  `[filter:var(--image-filter)]`. No shadows. Shown in `dark-recipe-desktop.png`, `dark-home-ipad.png`.
- **D-09 (P1) Primary button mass.** `ui/Button.tsx`: keep ink fill but reduce horizontal padding `px-5` to `px-4` and
  switch home "Add recipe" to `variant="secondary"` with "Import" as `ghost`, leaving one filled button only on
  recipe ("Start cooking") and forms. Page change is only prop values. Shown in `light-home-ipad.png`.
- **D-10 (P1) Home head groups.** `ui/PageHeader.tsx`: `pb-8` to `pb-10`, `gap-4` to `gap-3`, and a `ui/Contents` or
  home toolbar wrapper with `mt-10` between the head rule and search; search-to-chips gap 12px (`gap-3`), chips to
  list 40px. Same light and dark. Shown in `light-home-ipad.png`.
- **D-11 (P1) Filtered state header jump.** `ui/PageHeader.tsx`: reserve the deck line (`min-h-[2.1em]` when
  `description` is absent but `reserveDeck` prop set) so tag/search states do not shift the buttons 48px.
  Shown in `light-home-tag-ipad.png` versus `light-home-ipad.png`.
- **D-12 (P1) Phone masthead underline starts outside the gutter.** `ui/Masthead.tsx`: `nav` `-mx-2` to `mx-0` and first
  item `pl-0` on `max-sm`, nav item `px-2` to `pe-3 ps-0` so the active underline starts at x=16 like the wordmark.
  Shown in `light-home-phone.png`.
- **D-13 (P1) Search field type mismatch and truncation.** `ui/Input.tsx`: placeholder and value both `text-body`;
  placeholder `placeholder:not-italic`-free: keep italic, but give value `font-normal not-italic`; reduce phone
  placeholder to avoid truncation by shortening the copy to "Search recipes" via the home page prop (copy only) and set
  `text-ellipsis` explicitly. Shown in `light-home-nomatch-ipad.png`, `light-home-phone.png`.
- **D-14 (P1) Phone title clamp cuts mid-word.** `ui/Contents.tsx`: `line-clamp-3` to `line-clamp-4` on phone only
  (`line-clamp-4 sm:line-clamp-3`) and `hyphens-auto`, `[text-wrap:pretty]`. Shown in `light-home-phone.png`
  ("foo...").

### P2

- **D-15 (P2) Accent saturation on the list.** `ui/Contents.tsx` kicker wrapper: tint entry kickers with
  `text-ink-muted` and keep accent for the recipe page kicker and the page kicker only. Light kicker `#5c554c`, dark
  `#b3a999`. Cuts home accent use from five red lines to one. Shown in `light-home-ipad.png`.
- **D-16 (P2) Label role split.** `globals.css` `.label` stays; add `.label-quiet` (weight 500, tracking 0.1em) for
  chips, nav and meta, keep 600 for buttons and field labels. Colour unchanged. Shown in `light-home-ipad.png`.
- **D-17 (P2) Method "To serve" subsection spacing.** `ui/Article.tsx`: subsection heading `mt-8 mb-3` (currently ~16/12)
  and numerals restart cue: add a hairline `border-t border-(--rule-hair) pt-5` above each subsection heading. Shown in
  `light-recipe-ipad.png` ("TO SERVE").
- **D-18 (P2) Numerals thin.** `ui/Article.tsx` numeral token `--text-numeral` 28px to 32px, `--numeral-fg` unchanged
  (accent 7.68:1 light, 7.06:1 dark). Shown in `dark-recipe-ipad.png`.
- **D-19 (P2) Ingredient sidebar in dark is barely distinct.** `themes/evening.css` paper-deep `#211c17` to `#241f19`
  (still 14.6:1 ink, ink-muted 6.9:1 text-safe; rule-strong vs paper-deep stays above 3:1, check with
  `check_contrast.py --matrix`). Shown in `dark-recipe-ipad.png`.
- **D-20 (P2) Login frame and vertical balance.** `ui/Card.tsx`: padding `p-10`, frame `border-(--rule-hair)` already
  strengthened by D-07; auth page wrapper `min-h-[70vh]` top-biased (`pt-[14vh]`) rather than centred. Shown in
  `light-login-ipad.png`.
- **D-21 (P2) Method column measure on landscape.** `ui/Article.tsx`: cap the method text at `max-w-[34rem]` so line
  length stays near 65 characters at desktop (currently ~85, `dark-recipe-desktop.png` steps run 1160-624). Same light and dark.
- **D-22 (P2) Not-found page lacks kicker.** `ui/EmptyState.tsx` usage: add a "404" `.label` kicker above the title and
  use `ButtonLink variant="secondary"`; shown in `light-notfound-ipad.png`.

## Not changed (confirmed fine)

Palette matrix, 44px targets, focus ring (not captured in static shots; verify in the implementation pass), square
controls, no shadows, two serif families, masthead double rule, drop cap logic (not triggered by seed data: add a long
description recipe to confirm).
