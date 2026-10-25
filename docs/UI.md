# Recipe Box UI guide: the Riviera look

Recipe Box is set in the **Riviera · Charcoal & Saffron** direction (ADR 0009, October 2026): cool off-white paper,
charcoal-slate ink, one deep saffron accent used sparingly, a calm display serif for titles, a small tracked sans for
labels, a readable text serif at 20px, a narrow reading measure, hairline rules and italic decks. The evening
appearance is near-black slate with a brighter saffron. Read this before changing any UI so new screens keep the
style. The app shell (90rem page, charcoal top band, masthead, thin double rule) is done in #120; the home, recipe and
remaining screens are restyled in #121 and #122, so some page patterns below still describe the editorial layout.

The machine-readable lock (palette, contrast contract, structure) is `.tastemaker/style-lock.md`. The colour tokens
live in `frontend/src/styles/` in three layers (primitives, semantic themes, component tokens): see
`docs/THEMING.md`. Type scale, fonts and layout tokens are in `frontend/src/app/globals.css`.

## Originality and trademark rule (never bend)
- This is an original design in the general editorial tradition. Do **not** use The New Yorker's name, logo, mascot or
  masthead, and do not use its proprietary typeface (Irvin) or any look-alike "Irvin" font.
- The app is called **Recipe Box**, set in Marcellus.
- Fonts come only from open-licensed `@fontsource` / `@fontsource-variable` packages, imported in
  `src/app/layout.tsx`. Never `next/font/google`.

## Fonts
| Role | Family | Package | Token |
|---|---|---|---|
| Display: wordmark, headlines, card titles, numerals | Marcellus 400 | `@fontsource/marcellus` | `--font-display` |
| Labels: kickers, nav, buttons, metadata, field labels | Karla Variable, 500–600 | `@fontsource-variable/karla` | `--font-label` (`.label`, `.label-quiet`) |
| Text: body, italic decks, inputs | Crimson Pro Variable (wght, italic) | `@fontsource-variable/crimson-pro` | `--font-text` |

Marcellus has one weight and no italic. Never put `font-semibold`/`font-bold` or `italic` on it (`.font-display` sets
`font-synthesis: none`). Labels are always uppercase Karla, tracked about 0.14em, never under 13px. Crimson Pro runs
small, so reading text is 20px.

This **reverses the old "no sans" rule**: until October 2026 the app used two serifs only (Libre Caslon Display and
Newsreader). Karla is the one sans and it is for labels only, never running text. Three families in all; no fourth.

## Type scale (Tailwind `text-*` utilities)
| Token | Size | Use |
|---|---|---|
| `text-label` + `.label` | 13px Karla, uppercase, +0.14em, 600 (`.label-quiet` 500) | kickers, bylines, metadata, field labels, buttons, nav |
| `text-small` | 17px | hints, alerts, small print |
| `text-body` | 20px / 1.6 | body copy (minimum for reading text; iPad at arm's length) |
| `text-deck` | 22px, set italic | standfirsts under titles, empty-state copy, ledes |
| `text-title-sm` | 29px | card and listing titles |
| `text-title` | 36px | section titles ("Method"), empty states, auth headings |
| `text-numeral` | 34px | method step numbers (Marcellus, accent) |
| `text-wordmark` / `text-wordmark-lg` | 32–44px / 44–64px | the Recipe Box wordmark in the masthead / on auth pages |
| `text-headline` | clamp(40px, 68px) | page headline (`h1`) |

A starting point, tuned by eye: the layout issues (#120 to #122) may adjust sizes, never the families.

## Tokens (semantic CSS variables; full map in `docs/THEMING.md`)
Colour (`bg-*`, `text-*`, `border-*` utilities): `--color-paper`, `--color-paper-deep`, `--color-ink`,
`--color-ink-muted`, `--color-rule` (decorative hairline only), `--color-rule-strong` (control borders),
`--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-danger-hover`,
`--color-on-danger`, `--color-focus`, `--color-attention`, `--color-on-attention`, `--color-stage`, `--color-on-stage`,
`--color-band`, `--color-on-band`, `--color-band-accent`. Fonts: `--font-display`, `--font-label`, `--font-text`.

| Token | Day | Evening | Use |
|---|---|---|---|
| paper / paper-deep | `#f4f4f1` / `#eaeae5` | `#121416` / `#1b1e21` | page / sidebars, alerts, panels |
| ink | `#22262b` | `#eeede8` | text, primary fills (13.8:1 / 15.8:1 on paper) |
| ink-muted | `#565c63` | `#a9aeb4` | decks, bylines, metadata (6.1:1 / 8.3:1) |
| rule / rule-strong | `#d8d9d3` / `#7d8288` | `#2e3236` / `#6d7379` | decorative hairline / control borders (3.5:1 / 3.9:1) |
| accent / accent-hover | `#8a5c0c` / `#6f4a09` | `#e0b057` / `#ecc57a` | deep saffron: kickers, numerals, links, active underline, focus (5.3:1 / 9.3:1) |
| on-accent | `#f4f4f1` | `#121416` | text on an accent fill |
| danger / danger-hover / on-danger | `#a33a2b` / `#86301f` / `#f4f4f1` | `#ef9a8a` / `#f5b3a6` / `#121416` | brick red: errors, destructive buttons; never the accent |
| attention / on-attention | `#6fb5bd` / `#22262b` | same | sea teal "check this" wash, rule or mark; ink on it |
| stage / on-stage | `#1b1e21` / `#eeede8` | same | cook-mode and import darkroom ground |
| band / on-band / band-accent | `#22262b` / `#f4f4f1` / `#e9b75a` | `#22262b` / `#eeede8` / `#e0b057` | the charcoal top band and inverse panels (the band since #120) | Layout: `--measure` (38rem, `max-w-measure`), `--measure-form` (44rem, `max-w-form`: the editor, room for a field plus its row buttons), `--measure-wide` (72rem,
`max-w-measure-wide`: the recipe page's ingredient column and method), `--page-width` (90rem = 1440px, `max-w-page`; a
1920 monitor leaves 240px each side), `--gutter` (`px-gutter`), `--control-height`
(44px, `min-h-control`). Radius: `--radius-control` (2px).

Tailwind's default colour palette and font stacks are switched off (`--color-*: initial`), so every colour must be a
token. Dark mode (the "evening edition", `src/styles/themes/evening.css`) redefines the same variables under
`:root[data-theme="evening"]` and, when no `data-theme` is set, under `prefers-color-scheme: dark`; components never
branch on theme (see "Editions" below). Inside a ui component, themed decisions (button
fills, input borders, chip underlines, kicker and numeral colour, focus ring) use component tokens such as
`bg-(--button-primary-bg)`, so they can be retuned in `src/styles/components.css` without touching the component.

Old scaffold names map as: surface → paper, surface-sunk → paper-deep, text → ink, muted → ink-muted, border → rule,
border-strong → rule-strong, accent-ink → accent.

## Editions: day and evening
The app has two editions of the same page: the **day edition** (cool off-white paper, charcoal ink) and the **evening
edition** (near-black slate, brighter saffron). By default the clock chooses: evening from 19:00 to 06:59 local time, day from 07:00 to 18:59, so the
iPad is easy on the eyes at dinnertime whatever the device setting. Each device can instead pin day, pin evening or
follow its own light/dark setting (Settings, Appearance; stored in `localStorage` as `rb-edition`). An inline script in
the root layout sets `<html data-theme>` before first paint; `EditionController` keeps it current. How it works:
`docs/THEMING.md`. Components never branch on the edition; they read tokens.

## Print inks
Three illustration colours exist as primitives (`--mustard-500` `#d9a21b`, `--fern-700` `#3f6b45`, `--tomato-600`
`#d2492a`) for spot icons and stamps. None has a semantic token now: `--color-attention` moved from mustard to sea teal
(`--sea-400`) in the Riviera restyle because mustard read as the saffron accent (see `docs/THEMING.md`). Name the
meaning before using an ink. Contrast against paper (recorded in `tokens.test.ts`):

| Ink | Day paper | Evening paper | Use |
|---|---|---|---|
| Mustard | 2.09:1 decorative only | 8.03:1 text-safe | flat fills and decoration by day; never text or a lone line; too close to saffron to carry a meaning |
| Fern | 5.60:1 text-safe | 2.99:1 decorative only | text-safe by day; decoration only in the evening |
| Tomato | 4.03:1 graphics | 4.16:1 graphics | icons and strokes (3:1); not for body text |

## Motion
Motion marks a change of state or place. It never decorates.
- One easing, `--ease-out`; durations between 150 and 900 ms.
- Nothing loops except an active timer, a scan in progress or the in-season ticker.
- Loading skeletons are a static tint: they do not shimmer or pulse.
- Arrival staggers (list entries rising in) run once per visit and never when the person goes Back.
- `prefers-reduced-motion` removes movement (rises, draws, morphs); colour changes stay.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | the one curve (defined in `globals.css`) |
| `--duration-quick` | 150ms | hover and press feedback, colour changes |
| `--duration-base` | 300ms | a state change in place: draw a rule, show a toast |
| `--duration-morph` | 450ms | card photo and title become the recipe page |
| `--duration-slow` | 900ms | headline words rise, the save stamp lands |
| `--stagger-step` | 120ms | gap between list entries arriving |

Card hover and keyboard focus (`.mag-card` in `motion.css`) behave alike: the plate scales to 1.03 and turns -1deg over
`--duration-slow`, and the title underline draws over `--duration-morph`. The in-season ticker is the one permitted
loop besides timers (70 s per pass, paused by hover or focus). Under `prefers-reduced-motion: reduce` the plate does
not move, the underline appears without drawing, and the ticker stands still as a wrapped list.

On the recipe page the opener photo turns a couple of degrees as it scrolls through view (CSS scroll-driven
animation under `@supports`, still under reduced motion), a ticked ingredient has an accent line drawn through it
(`.strike`), rescaled quantities fade to their new value, and the floating bar slides up when the opener's buttons scroll away.

Durations are defined in `src/styles/motion.css`.

## Where styling lives (enforced by `src/styles/page-styling.test.ts`)
- **Only `src/components/ui/*` styles things.** Colour, type, borders, the helper classes below, arbitrary values
  and component tokens appear there and nowhere else.
- **Pages, layouts and app components** (`src/app/**`, `src/components/*.tsx`) compose ui components and use layout
  utilities only: `flex`, `grid`, `gap-*`, `p*-*`, `m*-*`, widths/heights (`max-w-page`, `max-w-measure`,
  `px-gutter`, `min-h-control`), `items-*`/`justify-*`/`self-*`, `overflow-*`, positioning, `sr-only`,
  `text-center`. No `style={…}`, no `ui/cx`.
- Need a look a page doesn't have? Add a variant to the ui component (or a new ui component), then use it.

## Helper classes (`globals.css`, components layer; ui components only)
- `.label`: the uppercase tracked Karla label style.
- `.label-quiet`: the lighter label voice (weight 500) for chips, nav and meta; `.label` (600) stays for buttons, field labels and kickers.
- `.dot-list-stack` (via `DotList stackOnPhone`): below 640px the items sit one per line with no dots, so a wrapped line never starts or ends on a dot.
- `.dot-list`: inline list with middle dots between items ("SERVES 4 · 30 MIN"); the dot trails each item so no line
  starts with an orphan dot.
- `.drop-cap`: accent drop cap on a lede paragraph.
- `.rule-double`: thin double rule, 1px line, 3px gap, 1px line (masthead, ingredient sidebar).
- `.link`: accent underlined text link.

## Components (`src/components/ui`)
Text and structure:
- `Text`: every run of text. `variant`: `body` (20px), `deck` (italic standfirst), `small`, `aside` (small italic,
  e.g. "Source: …" in a byline), `note` (italic body, e.g. recipe notes, "No steps listed."), `meta` (uppercase
  muted label), `strong` (upright semibold inside italic copy). `as` picks the element; `preserveLines` keeps typed
  line breaks. Variants reset case and tracking, so they nest inside labels.
- `Heading`: `level` 1–3 and `size`: `title`, `title-sm`, `label`, `kicker` (accent label), `group` (italic
  semibold list group). `ruled` runs a hairline to the column edge ("Method ———").
- `DotList`: items separated by middle dots; `as="ul"` (children `<li>`) or `as="p"` (children `<span>`),
  `align="center"`, `tone="meta"`.
- `Rule`: `hair` or `double` (the thin double rule). `ExternalLink`: accent link to another site, new tab.
- `Logo` (`size="lg"` on auth), `Masthead` + `NavLink` (the app header), `TopBand` + `BandButton` (the charcoal band above it), `SkipLink`.
- `Contents` + `ContentsEntry`: the two-column contents listing and one entry (kicker, title link, deck, meta,
  thumbnail); the whole entry is clickable and the focus ring wraps it.
- `Article.tsx`: `Lede` (drop cap) and `SidebarLayout` (ingredients beside the method). The rest of the recipe page
  is the spread kit below.

Controls and states:
- `ui/Button` / `ButtonLink`: `primary` ink fill (hover turns accent), `secondary` ink outline, `ghost` underlined,
  `danger` accent fill. Labels are `.label`. At least 44px tall; below `sm` long labels wrap (centred) instead of overflowing.
- `ui/PageHeader`: `kicker`, `title` (display headline), `description` (italic deck), `byline`, `actions`,
  `align="start" | "center"`, `reserveDeck` (keeps the deck's height when there is no description); ends with a
  hairline.
- `ui/Card`: hairline frame, square, no shadow (auth forms).
- `ui/Chip`: tag filter set like a magazine index; selected gets an accent underline; `count` shows muted after the
  name. `ChipRow` wraps the chips onto further lines (never a scroller). `Badge`: accent label for tags.
- Photos (lead photo, listing thumbnails) read `--photo-filter`: none by day, slightly dimmed in the evening theme.
- `ui/Field`, `ui/Label`, `ui/Input`: uppercase label, square input with a 3:1 border, italic hint.
- `ui/Textarea` (shares `inputClass` with `Input`), `ui/Fieldset` (legend over a hairline, optional hint),
  `ui/IconButton` (44px outlined icon button; `icon` is `up`, `down`, `remove` or `heading`, `label` is required;
  `quiet` drops the outline), `ui/ListEditor` (`EditorList` + `EditorItem`: optional accent numeral, section heading
  slot with a left rule, row controls), `ui/TagList` (removable tags), `ui/PhotoField` (file picker with preview,
  Remove, busy and error states). These make up the recipe editor.
- Import screen: `ui/Tabs` (tablist styled like the tag index, arrow keys; panel id `${idPrefix}-panel`),
  `ui/PhotoPicker` (several photos with previews and remove; `accept="image/*"` so iPadOS offers camera and library)
  and `PhotoGallery` (stored photos, each linking to full size), `ui/ChoiceGroup` (radios with italic hints),
  `ui/Pending` (status note with a quiet bar and a way out; token `--progress-fg`). `Heading` takes `ref` and
  `tabIndex` so a page can move focus to a result.
- `ui/Panel`: tinted (paper-deep) block for an inline form or confirmation. `ui/ConfirmInline`: two-step confirmation in a Panel; focus starts on the safe "Keep" button. `ui/MemberList` + `MemberItem`: people separated by hairlines with name, "You" marker, detail, actions, a note and an opened panel. `ui/DetailList`: label/value pairs as a definition list.
- Magazine home (#39), all in `ui/`: `CoverStory` (kicker, ~90px headline that is an h2 (the page's h1 is a visually hidden "Recipes"), italic deck, meta, buttons, photo right or above on a phone), `Ticker` (in-season marquee: the looping copy is `aria-hidden`, it pauses under a hovering pointer and on `:focus-within`, a 44px Pause/Play button (or a tap on the text) stops it, reduced motion stops it, hides the button and wraps the list; `components/home/LocalIssue` follows the reader's local clock for the date, season name and ticker after mount), `MagazineCard` + `CardGrid` + `IssueLayout` (4:3 plate or a paper plate with a spot icon, kicker with tags left and time right, display title with a drawn accent underline, two-line deck; the grid sits beside the sidebar from 1024px), `IssueIndex` + `IssueIndexItem` (numbered "Also in this issue") and `FeaturePanel` (the inverse "Haven’t cooked in a while" block; tokens `--feature-*`, same inverse idea as the toast), `SearchField` + `SearchSort` (the display-type search box with a rule beneath and the sort menu set as a quiet label). The empty-box and server-error states omit the issue line by decision ("No. 0" reads oddly).
- `ui/Select`: native select set like Input (iPadOS wheel picker); used for the home sort menu. Home search lives in
  `components/search/` (`SearchControls`: debounced 250 ms `router.replace` of `?q=`, uncontrolled input so focus and
  caret survive, Enter/Search/sort push history; `ResultSummary` live count; `NoMatches` with "Clear search").
- Share page (#21): `ui/BookmarkTab` (draggable `javascript:` link; the href is set by hand because React refuses it, and a click does nothing), `ui/CodeBlock` (a line to copy exactly, selects whole on tap), `ui/Disclosure` (closed-by-default native `details` note, 44px summary), `ui/Steps` + `Step` (numbered how-to steps with a display numeral).
- `ui/Alert`: margin note with a 3px left rule on paper-deep.
- `ui/EmptyState`: display title, italic copy, closing hairline.
- `ui/Toast` (`ToastRegion`, `Toast`, `ToastAction`, `ToastLink`, `ToastDismiss`): inverse message pinned to the bottom, 44px actions, tokens `--toast-*`. The region is a polite live region and stays mounted (`lifted` sits it above the grocery `SelectionBar`); a `Toast` that reports a failure takes `role="alert"`; hidden in print. Separated by a hairline border, never a shadow. Used by `undo/UndoToast` and the grocery list (a write that didn't save, the result of adding recipes from the home grid).
- Grocery list (#80), all in `ui/GroceryKit.tsx`: `RecipeShelf` (native `details` of the recipes on the list; a quiet hairline head, folded at first from three recipes), `RecipeRow` + `ScaleStepper` (− 1× +; an unusable end is `aria-disabled`, never `disabled`, so keyboard focus stays on it), `GrocerySection` (ruled, letter-spaced head that sticks to the top while its items scroll; rows carry `scroll-mt-14` so focus is never left under it), `GroceryRow` (the whole 56px row is the tick: `aria-pressed`, the recipe page's drawn `.strike`; `data-item-id` lets the page return focus to it), `RowMenu` (three-dot `role="menu"`: arrows, Home/End, Escape and Tab return focus to the button; a group of `checked` entries is a radio set; opens upward when there is no room below the button), `ListBody` (the items area; takes focus from script when a button disappears), `NavCount` (the accent to-buy count after "Groceries" in the masthead), `SelectCard` + `SelectionBar` (choose recipes on the home grid; the bar is fixed at the bottom, class `selection-bar` adds scroll padding like `floating-bar` and 7rem of room under `main`, so the ink panel never ends behind the ink pill). Controls that don't print carry `print:hidden`. Uses existing tokens only. The masthead nav sets in three aligned columns below 640px instead of scrolling sideways. The list column keeps to the form measure (44rem). `IngredientPanel` takes a `footer` (the recipe page's Add to groceries). #81 added `SendArea` (labelled "Send to…" group: buttons in a wrapping row, one per line on a phone, then the hint, confirmation or error beneath; not printed). `HardLink` (a plain `<a>` for a full page load, as a button or as an inline `.link`; used for the Google connect address, which next/link would prefetch) is in `ui/Button.tsx` beside `ButtonLink`. The app side is `groceries/SendList` (Share where `navigator.share` exists, else Copy; Copy works without the clipboard API, on plain http, via `lib/copy-text`, and as a last resort shows the text in a selected read-only box; Send to Google Tasks when the server has Google set up; a Home Screen app is told to connect from the browser instead, `lib/installed-app`) and `settings/GoogleTasksSection`.
- Recipe spread (#40), all in `ui/`: `SpreadOpener` (split opener: kicker, ~100px headline whose words rise in, italic deck, byline, byline, actions (Start cooking, Edit and Delete; the block has id `opener-actions`); photo full height on the right from 1024px, meeting the rule under it, and a 3:2 band below the text before that; the photo is not printed; without a photo the headline spans the width over a spot icon; titles over 40 characters step down a size; carries the card→page morph names), `NumeralsBand` (items `{ label, value?, text?, parts?, spoken? }` in display numerals (`parts` are number + small unit pairs side by side, "3hr 20min"; `text` sets a phrase like "makes about 4 bowls" in smaller type) between a thick and a thin rule, auto-fit columns so 2×2 on a phone; `spoken` is what screen readers get for shorthand like "3hr 20min"), `IngredientPanel` + `IngredientGroup` + `IngredientRow` + `ScaleControl` (paper-deep panel; each row is a button with `aria-pressed`, a checkbox, an accent tabular quantity column and a line drawn through ticked text, quantity included, which turns muted; print drops the checkbox column; ScaleControl is a labelled radio group, 44px targets), `MethodHeader` + `MethodStep` + `IngredientMention` (dotted accent underline linking to `#ingredient-<i>`; following it focuses the row, and the row is highlighted while it is the `:target`) + `TimerChip` (pill with a clock around the step's own words, so the text reads and copies unchanged; plain text in print), `PullQuote` (single-line notes of 140 characters or fewer in display type, longer ones at body size, a paragraph per line break), `FloatingBar` (fixed pill, hidden (inert, opacity-only under reduced motion) until the opener's actions scroll out of view, watched with an IntersectionObserver in `RecipeBar`, and shown at once without one; with a polite status, in a short form such as "3 checked" below 640px so it stays on one line, and the accent Start cooking link; pages leave `pb-28` under their content; hidden in print). Tokens: `--qty-fg`, `--strike-fg`, `--mention-line`, `--target-bg`, `--timer-*`, `--bar-*`; the evening edition re-points `--timer-*` and `--bar-*` at paper-deep and ink so they do not glare.
- Cook mode (#41), always the evening edition: the route `recipes/[id]/cook` renders `components/cook/CookMode` (client; step index, timers and voice live above the step view so timers survive step changes; logic in `cook-logic.ts`, optional voice in `use-voice.ts`). UI in `ui/CookKit.tsx`: `CookStage` (a modal `role="dialog"`, the rest of the app `inert` while it is open; it pins the evening edition with `pinEdition`/`unpinEdition` from lib/edition.ts, after an inline `PIN_EVENING_SCRIPT` on the page sets `data-edition-pin` before paint, so `applyEdition` keeps evening and theme-color and leaving recomputes the person's edition; it owns the touch handlers, so a swipe works anywhere but on a control), `CookTopBar` (h1 title; Close asks first while a timer runs), `CookVoiceToggle`, `CookProgress` (one segment per step), `CookColumns` (rail 26% / step 44%, centred / timers 26% from 1024px, each scrolling alone; narrower: one row of chips, the step scrolling, timers above the footer), `CookRail` + `CookRailRow` (lit ingredients first, the rest dimmed; chips show only lit ones until "+N more"), `CookStepText` (40px from 700px, 28px below) + `CookMention` + `CookTimerButton` (kept on one line with the full stop after it), `CookTimers` + `CookTimer` (rings for the first three, compact rows after; a finished timer flashes the accent by colour for 10 s, then stays accent), `CookLive` (polite announcements, step changes included), `CookFooter` with `CookPill` / `CookPillLink` (60px tall; next-step preview hidden on a phone). Back/Next, ←/→ and a swipe move; the audio context is made and resumed on the first tap or key and the chime reuses it. #13 added: `CookToolbar` (a focusable group under the progress bar holding `CookViewToggle` (One step / All steps, two `aria-pressed` buttons), `CookTextButton` ("Clear ticks", shown once anything is ticked; focus moves to the toolbar when it goes) and `CookWakeStatus` ("Screen stays on" with an accent dot while the lock is held; nothing while it is being requested; otherwise a button that opens `CookWakeNote`, a short note on https, iPadOS 18.4+ in the Home Screen app, or Auto-Lock → Never)); `CookRailRow` is now a 44px `aria-pressed` button with the same drawn strike as `IngredientRow` (22px chips from 700px); `CookTick` (checkbox-style Done toggle, 44px) sits beside the step kicker via `CookStepText`'s `action` slot; `CookProgress` shows done steps; `CookStepList` + `CookStepItem` are the all-steps view (accent display numeral, the current step marked by an accent left rule and scrolled into view, done steps muted with the tick, ≥ 24px text, timer chips still live); `CookFooter`'s `summary` ("2 of 6 steps done") replaces the next-step preview in that view, with Finish only. Swipe, arrows and voice next/back only move in the one-step view. State (`components/cook/cook-store.ts`): `cook-ticks:<id>` in localStorage as `{ v: 1, at, ingredients, steps }`, read as empty after 12 hours, dated in the future, or corrupt; out-of-range indexes dropped; synced across tabs by the `storage` event; in-memory fallback when storage throws; nothing ticked on the server render. On the first load the one-step view opens at the first step not done. `cook-view` remembers the view per device. Wake lock: `components/cook/use-wake-lock.ts` requests `screen` while visible, re-requests on `visibilitychange` and after the system releases it, and releases on close. Uses existing tokens only.
App components (`src/components/*.tsx`, `src/components/recipe-form/*`, no styling of their own):
- `recipe-page/*`: `RecipeState` (`RecipeStateProvider` keeps the ticked ingredients and the scale per recipe in sessionStorage as `recipe-ticks:<id>` and `recipe-scale:<id>`; the server and hydrating render see nothing ticked, then the stored state appears; `ScaledServings`), `session-store.ts` (the sessionStorage hook, with an in-memory fallback when storage throws), `IngredientChecklist`, `RecipeBar`, `StepText` + `mentions.ts` (`annotateStep`: timers from `splitDurations`, then ingredient names matched on word boundaries, longest first, each linked once per step; the name heuristic is documented there), `DeleteRecipeButton` (ghost Delete, no dialog: deletes, shows the toast, goes home), `byline.ts` (data for "Added by X", "Edited by Y" only when someone else or a later edit) and `LocalDate` (client-formatted `<time>` in the viewer's time zone, empty on the server).
- `undo/*`: `undo-store.ts` (module list of offers kept across client navigation; one toast each, newest on top, three shown; cleared on sign-out and when the layout unmounts), `UndoToast` (mounted once in `(app)/layout.tsx`; 10 s countdown paused by hover or focus; Undo restores and reopens the recipe; 409 says it is too late).
- Print: the `@media print` block at the end of `globals.css` sets ink on white, keeps each step whole and prints link URLs; chrome uses `print:hidden`.
- `recipe-form/RecipeForm`: the editor for new recipes, edits and import review. Props `initial`
  (`RecipeInput`, `RecipeDraft` or `Recipe`; draft `warnings` are shown), `submitLabel`, `onSubmit(input)` (saves and
  navigates; throw an `ApiError` to show it), `cancelHref`, `draftKey` (recipe id or "new": names the
  sessionStorage draft that `recipe-form/draft-stash.ts` keeps while the form is dirty and offers back with
  Restore/Discard; `null` keeps none), `startDirty` (the starting values count as unsaved, for an import draft). `recipe-form/list-model.ts` holds the pure list logic.
- `import/ImportScreen` (+ `ImportPanels`, `import-errors.ts`): `/import` with Link, Photo and Text modes (mode in
  `?mode=`, `?url=` shows an "Import this page?" confirm first, then imports), loading and error notes, review in `RecipeForm` with the original photos
  beside it. `explainImportError` maps every API error code to a title, message and next steps (Try again, Type it in, Sign in, Paste the text instead). Below `lg` the original photos are a horizontal strip above the form.
- Import as a darkroom (#42): `import/ImportScreen` has Photo / Link / Paste text tabs (`ui/Tabs`, arrow keys). While a request is in flight a `ScanHeading` ("Reading your page") sits over `ui/Darkroom` `ScanStage` (the photo tilted on the `stage` ground with an `attention` scan line and a pulsing dot, motion only) or `DomainCard`. When the draft arrives the photo stays on the left (sticky from 1024px, above the draft below that) with `regions` boxes if the draft has them (further photos in a strip under it), and the right column has `DraftKicker` ("Draft · not saved yet"), `DraftTitle` (typed in once, full title for screen readers) and `DraftRow`s: a check or a `?` badge at the left, the quantity (`splitIngredient`) in accent tabular figures, then the line. Every row is shown; rows with `confidence` under 0.6 get the `attention` wash and the `?` (ink on the attention colour); only the slide-in stagger stops after 12 rows. Warnings go in `DraftNote` (attention rule). AI off: no scan, the photo sits beside the empty form. Reduced motion removes the sweep, dot, typing and slide. The attention colour is only a wash, rule or mark; contrast is tested in `tokens.test.ts`.
- `settings/*`: `/settings`. `SettingsView` (My account always; Household for admins only; AI import), `PasswordForm` (own password asks for the current one; an admin reset doesn't; errors on the field, 401 lands on Current password), `AddMemberForm`, `HouseholdSection` (list, a Google email panel per member via `EmailForm` that warns changing or clearing disconnects their Google sign-in, reset panel, remove confirmation naming the person; Remove is off for yourself and the last admin, with the reason shown; focus returns to the Reset button or the Household heading), `GoogleSignInSection` (every member: connected Google accounts, Disconnect with confirmation, Connect Google as a `HardLink`; a Home Screen app is told to connect from Safari; a failed providers fetch says it couldn't check rather than "off"), `AiImportSection`.
- `AppBand`: the `TopBand` with the reader's local date, season, the household's recipe count and Sign out (`use-sign-out.ts` holds the sign-out steps). `AppHeader`: `Masthead` with the app's sections. `RecipeCard`: a recipe as a `MagazineCard`.
- `Placeholder`, `ErrorContent`, `NotFoundContent`, `ServerError`, `RetryButton`.

## Page patterns
- **App shell** (every signed-in screen, `app/(app)/layout.tsx`): the full-width charcoal **top band** (`ui/TopBand`,
  `--color-band` / `--color-on-band`, at least 44px tall, `print:hidden`), then the **masthead** (`ui/Masthead`: the
  Marcellus wordmark, about 44px, on the left; Recipes, Groceries with its saffron count, Add, Import and Settings on
  the right as uppercase Karla labels, the current one with a 2px accent underline), then the thin double rule
  (`.rule-double`: 1px ink, 3px gap, 1px ink), then `main`. Band, masthead and `main` share the same edges
  (`max-w-page px-gutter`, 90rem; gutter 16px phone, 40px from 768px); the band itself bleeds to the window edge and its
  content respects the iOS safe-area side insets. The band's left side is one label line, `Sunday, October 25 ·
  Autumn · 24 recipes`: the date and season come from the browser's clock (`lib/local-day.ts`, `useLocalDay`; the
  server's UTC day only until it mounts) and the count from a `limit=1` recipe request in the layout, left out if that
  fails. The layout renders once per visit, so the count refreshes on a reload or `router.refresh()`, not on every
  client navigation. On a phone the season drops and the line may wrap; Sign out (right) stays a 44px target and its
  focus ring sits inside the band (`--focus-offset`). Sign out ends the session, then `dismissUndo()` and
  `forgetOffline()`, then goes to `/login`. There is no volume, number or "Issue" wording in the shell.
- **Home** (a magazine cover): the cover story (the photo recipe edited longest ago; its headline
  is the h1), the in-season ticker, a large search field with the sort menu, the tag index (chips carry spot icons where
  the tag maps to one) and a two-column card grid with a sidebar (numbered "Also in this issue", the inverse "Haven’t
  cooked in a while" panel) that drops below the grid under 1024px. Logic (cover pick, slices) is in
  `components/home/issue.ts`. Without a photo recipe, the plain "Recipes" head replaces the cover; while searching or
  filtering the cover, ticker and sidebar are hidden and the band above is unchanged. Until the Made-it log (#23) exists,
  `updatedAt` stands in for "last cooked" and there is no cooked-count sticker.
- **Recipe** (a feature spread): the split opener (tags kicker, headline, deck if the description is 160 characters
  or less, byline with "Added by" and source, actions, photo right), the numerals band (Serves, Prep, Cook, Total;
  times as `20 min`, `3 hr` or `3hr 20min`), a drop-cap lede when the description is longer, then the ingredient panel
  (tap to tick, ½× / 1× / 2× scale) beside the method (large accent numerals, linked ingredient names, timer chips),
  the notes as a pull quote, and the floating bar. Scaling (`lib/scale.ts`) reads a leading quantity (fractions,
  ranges, a unit from a short list) and rewrites it as a cook would (1½, ¾); lines without one stay as written.
  Household notes in the margin are not built: the single notes field is the pull quote.
- **Auth**: centred wordmark, "The household cookbook", double rule, form in a hairline frame. Under the form, when the server offers it, `OrDivider` then `login/GoogleSignIn` (a secondary `HardLink`; in the Home Screen app a quiet line says to use the password if Google sends you back).
- **Placeholders**: "Forthcoming" kicker, headline, deck, empty state.

## Dos
- Keep body text at `text-body` (20px Crimson Pro) and reading columns at `max-w-measure`.
- Use italics (Crimson Pro) for decks, hints, notes and placeholders; keep headlines roman (Marcellus has no italic).
- Set every label in Karla through `.label` / `.label-quiet`, uppercase and tracked, 13px or more.
- Separate with hairlines (`border-rule`) and white space, not boxes.
- Keep the accent under roughly 5% of any screen: kickers, numerals, links, active underline, focus.
- Keep 44px targets, a visible `:focus-visible` ring (2px accent, 3px offset), and no horizontal page scroll at 390px.
- Check any new colour pairing against the contract in `.tastemaker/style-lock.md` (4.5:1 text, 3:1 UI).

## Don'ts
- No New Yorker name, logo, mascot, masthead or Irvin-style lettering (see above).
- No bold or italic display headlines; no fourth font family; no sans for running text (Karla is for labels only).
- Never use the saffron accent for errors or destructive actions: that is `danger`.
- No rounded cards, drop shadows, gradients, pill chips, emoji icons, or large accent fills.
- No em dashes in UI copy; use a colon, comma or full stop.
- No hard-coded hex or font names in components: use tokens.
- No colour, type or border classes in pages: use or extend a ui component.
