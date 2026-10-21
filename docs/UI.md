# Recipe Box UI guide: the editorial look

Recipe Box is set like a classic literary magazine: refined serif type, generous white space, a narrow reading
measure, hairline rules, uppercase letter-spaced kickers and bylines, italic decks under titles, and a near-monochrome
palette with one deep red used sparingly. Read this before changing any UI so new screens keep the style.

The machine-readable lock (palette, contrast contract, structure) is `.tastemaker/style-lock.md`. The tokens live in
`frontend/src/app/globals.css`.

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
| `text-headline` | clamp(40px, 72px) | page headline (`h1`) |

## Tokens (semantic CSS variables)
Colour (`bg-*`, `text-*`, `border-*` utilities): `--color-paper`, `--color-paper-deep`, `--color-ink`,
`--color-ink-muted`, `--color-rule` (decorative hairline only), `--color-rule-strong` (control borders),
`--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-focus`.
Fonts: `--font-display`, `--font-text`. Layout: `--measure` (38rem, `max-w-measure`), `--measure-wide` (64rem,
`max-w-measure-wide`), `--page-width` (72rem, `max-w-page`), `--gutter` (`px-gutter`), `--control-height`
(44px, `min-h-control`). Radius: `--radius-control` (2px).

Tailwind's default colour palette and font stacks are switched off (`--color-*: initial`), so every colour must be a
token. Dark mode (the "evening edition") redefines the same variables under `prefers-color-scheme: dark`; components
never branch on theme.

Old scaffold names map as: surface → paper, surface-sunk → paper-deep, text → ink, muted → ink-muted, border → rule,
border-strong → rule-strong, accent-ink → accent.

## Helper classes (`globals.css`, components layer)
- `.label`: the uppercase tracked label style.
- `.dot-list`: inline list with middle dots between items ("SERVES 4 · 30 MIN"); the dot trails each item so no line
  starts with an orphan dot.
- `.drop-cap`: accent drop cap on a lede paragraph.
- `.rule-double`: thick-over-thin rule (masthead, ingredient sidebar).
- `.link`: accent underlined text link.

## Components (`src/components`)
- `ui/Button` / `ButtonLink`: `primary` ink fill (hover turns accent), `secondary` ink outline, `ghost` underlined,
  `danger` accent fill. Labels are `.label`. 44px tall.
- `ui/PageHeader`: `kicker`, `title` (display headline), `description` (italic deck), `byline`, `actions`,
  `align="start" | "center"`; ends with a hairline.
- `ui/Card`: hairline frame, square, no shadow (auth forms).
- `ui/Chip`: tag filter set like a magazine index; selected gets an accent underline. `Badge`: accent label for tags.
- `ui/Field`, `ui/Label`, `ui/Input`: uppercase label, square input with a 3:1 border, italic hint.
- `ui/Alert`: margin note with a 3px left rule on paper-deep.
- `ui/EmptyState`: display title, italic copy, closing hairline.
- `AppHeader`: masthead (wordmark left, section links right, double rule). `Logo`: the wordmark (`size="lg"` on auth).
- `RecipeCard`: one contents entry: tag kicker, display title, italic deck (description), uppercase metadata,
  optional thumbnail on the right. The whole entry is clickable; the focus ring wraps the entry.

## Page patterns
- **Home**: article head ("The collection", Recipes, count deck, actions) then search and the tag index, then a
  two-column contents listing separated by hairlines (one column below 1024px).
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
