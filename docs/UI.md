# Recipe Box UI guide: the editorial look

Recipe Box is set like a classic literary magazine: refined serif type, generous white space, a narrow reading
measure, hairline rules, uppercase letter-spaced kickers and bylines, italic decks under titles, and a near-monochrome
palette with one deep red used sparingly. Read this before changing any UI so new screens keep the style.

The machine-readable lock (palette, contrast contract, structure) is `.tastemaker/style-lock.md`. The colour tokens
live in `frontend/src/styles/` in three layers (primitives, semantic themes, component tokens): see
`docs/THEMING.md`. Type scale, fonts and layout tokens are in `frontend/src/app/globals.css`.

## Originality and trademark rule (never bend)
- This is an original design in the general editorial tradition. Do **not** use The New Yorker's name, logo, mascot or
  masthead, and do not use its proprietary typeface (Irvin) or any look-alike "Irvin" font.
- The app is called **Recipe Box**, set in Libre Caslon Display.
- Fonts come only from open-licensed `@fontsource` / `@fontsource-variable` packages, imported in
  `src/app/layout.tsx`. Never `next/font/google`.

## Fonts
| Role | Family | Package |
|---|---|---|
| Display: headlines, titles, wordmark, step numerals | Libre Caslon Display 400 | `@fontsource/libre-caslon-display` |
| Text: body, italic decks, labels, buttons, inputs | Newsreader Variable (opsz, wght, italic) | `@fontsource-variable/newsreader` |

Libre Caslon Display has one weight. Never put `font-semibold`/`font-bold` on it (`.font-display` sets
`font-synthesis: none`). There is no sans-serif in the app.

## Type scale (Tailwind `text-*` utilities)
| Token | Size | Use |
|---|---|---|
| `text-label` + `.label` | 14px, uppercase, +0.12em, 600 | kickers, bylines, metadata, field labels, buttons, nav |
| `text-small` | 16px | hints, alerts, small print |
| `text-body` | 19px / 1.6 | body copy (minimum for reading text; iPad at arm's length) |
| `text-deck` | 22px, set italic | standfirsts under titles, empty-state copy, ledes |
| `text-title-sm` | 26px | listing titles on the home contents |
| `text-title` | 36px | section titles ("Method"), empty states, auth headings |
| `text-numeral` | 32px | method step numbers (display serif, accent) |
| `text-wordmark` / `text-wordmark-lg` | 30–34px / 44–64px | the Recipe Box wordmark in the masthead / on auth pages |
| `text-headline` | clamp(40px, 72px) | page headline (`h1`) |

## Tokens (semantic CSS variables; full map in `docs/THEMING.md`)
Colour (`bg-*`, `text-*`, `border-*` utilities): `--color-paper`, `--color-paper-deep`, `--color-ink`,
`--color-ink-muted`, `--color-rule` (decorative hairline only), `--color-rule-strong` (control borders),
`--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-focus`.
Fonts: `--font-display`, `--font-text`. Layout: `--measure` (38rem, `max-w-measure`), `--measure-form` (44rem, `max-w-form`: the editor, room for a field plus its row buttons), `--measure-wide` (64rem,
`max-w-measure-wide`), `--page-width` (72rem, `max-w-page`), `--gutter` (`px-gutter`), `--control-height`
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
The app has two editions of the same page: the **day edition** (warm paper, brown-black ink) and the **evening
edition** (dark). By default the clock chooses: evening from 19:00 to 06:59 local time, day from 07:00 to 18:59, so the
iPad is easy on the eyes at dinnertime whatever the device setting. Each device can instead pin day, pin evening or
follow its own light/dark setting (Settings, Appearance; stored in `localStorage` as `rb-edition`). An inline script in
the root layout sets `<html data-theme>` before first paint; `EditionController` keeps it current. How it works:
`docs/THEMING.md`. Components never branch on the edition; they read tokens.

## Print inks
Three illustration colours exist as primitives (`--mustard-500` `#d9a21b`, `--fern-700` `#3f6b45`, `--tomato-600`
`#d2492a`) for spot icons and stamps. No semantic token uses them yet; point a component token at a new semantic token
that names the meaning before using one. Contrast against paper (recorded in `tokens.test.ts`):

| Ink | Day paper | Evening paper | Use |
|---|---|---|---|
| Mustard | 2.17:1 decorative only | 8.05:1 text-safe | flat fills and decoration by day; never text or a lone line |
| Fern | 5.82:1 text-safe | 2.998:1 decorative only | text-safe by day; decoration only in the evening |
| Tomato | 4.19:1 graphics | 4.17:1 graphics | icons and strokes (3:1); not for body text |

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
- `.label`: the uppercase tracked label style.
- `.label-quiet`: the lighter label voice (weight 500) for chips, nav and meta; `.label` (600) stays for buttons, field labels and kickers.
- `.dot-list-stack` (via `DotList stackOnPhone`): below 640px the items sit one per line with no dots, so a wrapped line never starts or ends on a dot.
- `.dot-list`: inline list with middle dots between items ("SERVES 4 · 30 MIN"); the dot trails each item so no line
  starts with an orphan dot.
- `.drop-cap`: accent drop cap on a lede paragraph.
- `.rule-double`: thick-over-thin rule (masthead, ingredient sidebar).
- `.link`: accent underlined text link.

## Components (`src/components/ui`)
Text and structure:
- `Text`: every run of text. `variant`: `body` (19px), `deck` (italic standfirst), `small`, `aside` (small italic,
  e.g. "Source: …" in a byline), `note` (italic body, e.g. recipe notes, "No steps listed."), `meta` (uppercase
  muted label), `strong` (upright semibold inside italic copy). `as` picks the element; `preserveLines` keeps typed
  line breaks. Variants reset case and tracking, so they nest inside labels.
- `Heading`: `level` 1–3 and `size`: `title`, `title-sm`, `label`, `kicker` (accent label), `group` (italic
  semibold list group). `ruled` runs a hairline to the column edge ("Method ———").
- `DotList`: items separated by middle dots; `as="ul"` (children `<li>`) or `as="p"` (children `<span>`),
  `align="center"`, `tone="meta"`.
- `Rule`: `hair` or `double` (thick-over-thin). `ExternalLink`: accent link to another site, new tab.
- `Logo` (`size="lg"` on auth), `Masthead` + `NavLink` + `NavButton` (the app header), `SkipLink`.
- `Contents` + `ContentsEntry`: the two-column contents listing and one entry (kicker, title link, deck, meta,
  thumbnail); the whole entry is clickable and the focus ring wraps it.
- `Article.tsx`: the recipe article pieces: `MetaStrip`, `LeadPhoto`, `Lede` (drop cap), `SidebarLayout`, `Sidebar`
  (tinted, double rule), `RuledList`, `StepList` (accent numerals), `EndNote`.

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
- Magazine home (#39), all in `ui/`: `IssueLine` (Vol. / No. · season · date under the masthead rule), `CoverStory` (kicker, ~90px headline that is an h2 (the page's h1 is a visually hidden "Recipes"), italic deck, meta, buttons, photo right or above on a phone), `Ticker` (in-season marquee: the looping copy is `aria-hidden`, it pauses under a hovering pointer and on `:focus-within`, a 44px Pause/Play button (or a tap on the text) stops it, reduced motion stops it, hides the button and wraps the list; `components/home/LocalIssue` follows the reader's local clock for the date, season name and ticker after mount), `MagazineCard` + `CardGrid` + `IssueLayout` (4:3 plate or a paper plate with a spot icon, kicker with tags left and time right, display title with a drawn claret underline, two-line deck; the grid sits beside the sidebar from 1024px), `IssueIndex` + `IssueIndexItem` (numbered "Also in this issue") and `FeaturePanel` (the inverse "Haven’t cooked in a while" block; tokens `--feature-*`, same inverse idea as the toast), `SearchField` + `SearchSort` (the display-type search box with a rule beneath and the sort menu set as a quiet label). The empty-box and server-error states omit the issue line by decision ("No. 0" reads oddly).
- `ui/Select`: native select set like Input (iPadOS wheel picker); used for the home sort menu. Home search lives in
  `components/search/` (`SearchControls`: debounced 250 ms `router.replace` of `?q=`, uncontrolled input so focus and
  caret survive, Enter/Search/sort push history; `ResultSummary` live count; `NoMatches` with "Clear search").
- `ui/Alert`: margin note with a 3px left rule on paper-deep.
- `ui/EmptyState`: display title, italic copy, closing hairline.
- `ui/Toast` (`ToastRegion`, `Toast`, `ToastAction`, `ToastDismiss`): inverse message pinned to the bottom, 44px actions, tokens `--toast-*`. The region is a polite live region and stays mounted; hidden in print. Separated by a hairline border, never a shadow. Used by `undo/UndoToast`.
App components (`src/components/*.tsx`, `src/components/recipe-form/*`, no styling of their own):
- `recipe-page/*`: `DeleteRecipeButton` (ghost Delete, no dialog: deletes, shows the toast, goes home), `byline.ts` (data for "Added by X", "Edited by Y" only when someone else or a later edit) and `LocalDate` (client-formatted `<time>` in the viewer's time zone, empty on the server).
- `undo/*`: `undo-store.ts` (module list of offers kept across client navigation; one toast each, newest on top, three shown; cleared on sign-out and when the layout unmounts), `UndoToast` (mounted once in `(app)/layout.tsx`; 10 s countdown paused by hover or focus; Undo restores and reopens the recipe; 409 says it is too late).
- Print: the `@media print` block at the end of `globals.css` sets ink on white, keeps each step whole and prints link URLs; chrome uses `print:hidden`.
- `recipe-form/RecipeForm`: the editor for new recipes, edits and import review. Props `initial`
  (`RecipeInput`, `RecipeDraft` or `Recipe`; draft `warnings` are shown), `submitLabel`, `onSubmit(input)` (saves and
  navigates; throw an `ApiError` to show it), `cancelHref`, `draftKey` (recipe id or "new": names the
  sessionStorage draft that `recipe-form/draft-stash.ts` keeps while the form is dirty and offers back with
  Restore/Discard; `null` keeps none), `startDirty` (the starting values count as unsaved, for an import draft). `recipe-form/list-model.ts` holds the pure list logic.
- `import/ImportScreen` (+ `ImportPanels`, `import-errors.ts`): `/import` with Link, Photo and Text modes (mode in
  `?mode=`, `?url=` starts a link import), loading and error notes, review in `RecipeForm` with the original photos
  beside it. `explainImportError` maps every API error code to a title, message and next steps (Try again, Type it in, Sign in, Paste the text instead). Below `lg` the original photos are a horizontal strip above the form.
- `settings/*`: `/settings`. `SettingsView` (My account always; Household for admins only; AI import), `PasswordForm` (own password asks for the current one; an admin reset doesn't; errors on the field, 401 lands on Current password), `AddMemberForm`, `HouseholdSection` (list, reset panel, remove confirmation naming the person; Remove is off for yourself and the last admin, with the reason shown; focus returns to the Reset button or the Household heading), `AiImportSection`.
- `AppHeader`: `Masthead` with the app's sections and sign-out. `RecipeCard`: a recipe as a `MagazineCard`.
- `Placeholder`, `ErrorContent`, `NotFoundContent`, `ServerError`, `RetryButton`.

## Page patterns
- **Home** (a magazine cover): the issue line, then the cover story (the photo recipe edited longest ago; its headline
  is the h1), the in-season ticker, a large search field with the sort menu, the tag index (chips carry spot icons where
  the tag maps to one) and a two-column card grid with a sidebar (numbered "Also in this issue", the inverse "Haven’t
  cooked in a while" panel) that drops below the grid under 1024px. Logic (cover pick, season, volume, slices) is in
  `components/home/issue.ts`. Without a photo recipe, the plain "Recipes" head replaces the cover; while searching or
  filtering the cover, ticker and sidebar are hidden and the issue line stays. Until the Made-it log (#23) exists,
  `updatedAt` stands in for "last cooked" and there is no cooked-count sticker.
- **Recipe**: centred head (tags kicker, headline, deck if the description is 160 characters or less, byline with
  "Added by" and source, actions), uppercase meta strip, photo, a drop-cap lede when the description is longer,
  then the ingredient sidebar (paper-deep, double rule) beside a numbered method set like an article (accent display
  numerals in a hanging column), then notes.
- **Auth**: centred wordmark, "The household cookbook", double rule, form in a hairline frame.
- **Placeholders**: "Forthcoming" kicker, headline, deck, empty state.

## Dos
- Keep body text at `text-body` (19px) and reading columns at `max-w-measure`.
- Use italics for decks, hints, notes and placeholders; keep headlines roman.
- Separate with hairlines (`border-rule`) and white space, not boxes.
- Keep the accent under roughly 5% of any screen: kickers, numerals, links, active underline, focus.
- Keep 44px targets, a visible `:focus-visible` ring (2px accent, 3px offset), and no horizontal page scroll at 390px.
- Check any new colour pairing against the contract in `.tastemaker/style-lock.md` (4.5:1 text, 3:1 UI).

## Don'ts
- No New Yorker name, logo, mascot, masthead or Irvin-style lettering (see above).
- No bold or italic display headlines, no third font family, no sans-serif UI font.
- No rounded cards, drop shadows, gradients, pill chips, emoji icons, or large accent fills.
- No em dashes in UI copy; use a colon, comma or full stop.
- No hard-coded hex or font names in components: use tokens.
- No colour, type or border classes in pages: use or extend a ui component.
