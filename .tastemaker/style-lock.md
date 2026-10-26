# Style lock — Recipe Box

Established: 2026-10-21 (editorial magazine). Re-locked: 2026-10-25, **Riviera · Charcoal & Saffron** (ADR 0009,
`docs/design/restyle-2026-10-riviera/README.md`). Source: owner-chosen direction after comparing four directions and
four Riviera variants; original design, no trademarked names, logos or typefaces. Palette hand-set and matrix-checked.
Full guide for builders: `docs/UI.md`. Colour tokens live in `frontend/src/styles/` (primitives, themes/day + evening,
component tokens; see `docs/THEMING.md`), and this contract is enforced by `frontend/src/styles/tokens.test.ts`.

## Lane
- Riviera: refined and calm rather than magazine-like, for a long-lived household app. Cool paper, charcoal ink, one
  saffron accent; a charcoal top band, band-coloured inverse panels and toasts, paper-deep side panels under a thin
  double rule, ruled tiles instead of boxed cards.

## Palette (light: day)
- Paper `#f4f4f1` (page) · Paper-deep `#eaeae5` (ingredient sidebar, alerts, panels)
- Ink `#22262b` (text, primary button fill) — 13.8:1 on paper, 12.6:1 on paper-deep
- Ink-muted `#565c63` (decks, bylines, metadata, hints) — 6.1:1 on paper, 5.6:1 on paper-deep
- Accent `#8a5c0c` deep saffron, sparingly (kickers, step numerals, links, active underline, focus) — 5.3:1 on paper,
  4.8:1 on paper-deep
- Accent-hover `#6f4a09` (7.2:1) · On-accent `#f4f4f1`
- Danger `#a33a2b` brick red (6.0:1 paper, 5.4:1 paper-deep) · Danger-hover `#86301f` · On-danger `#f4f4f1`
- Rule `#d8d9d3` decorative hairlines only · Rule-strong `#7d8288` control borders (3.5:1 paper, 3.2:1 paper-deep)
- Attention `#6fb5bd` sea teal (wash, rule or mark only; ink on it 6.5:1) · Stage `#1b1e21` / on-stage `#eeede8` (14.3:1)
- Band `#22262b` / on-band `#f4f4f1` (13.8:1) / band-accent `#e9b75a` (8.3:1)
- Button label: paper on ink (13.8:1); paper on accent (5.3:1); paper on danger (6.0:1)

## Dark mode: evening, chosen by the clock
- Evening shows 19:00 to 06:59 local time by default, day 07:00 to 18:59. Per device, Settings can pin day, pin
  evening or follow the device (`localStorage` `rb-edition`). `<html data-theme>` carries the result; with no
  attribute the device's `prefers-color-scheme` decides. See `docs/THEMING.md`.
- Paper `#121416` · Paper-deep `#1b1e21` · Ink `#eeede8` (15.8:1 / 14.3:1) · Ink-muted `#a9aeb4` (8.3:1 / 7.5:1)
- Accent `#e0b057` brighter saffron (9.3:1 on paper, 8.4:1 on paper-deep) · Accent-hover `#ecc57a` (11.3:1) · Focus = accent
- Danger `#ef9a8a` (8.5:1 / 7.7:1) · Danger-hover `#f5b3a6` · On-danger and on-accent `#121416`
- Rule `#2e3236` decorative · Rule-strong `#6d7379` (3.9:1 on paper, 3.5:1 on paper-deep)
- Band `#22262b` / on-band `#eeede8` (13.0:1) / band-accent `#e0b057` (7.6:1); stage and attention as by day

## Color contract (check_contrast.py --matrix, both modes)
- Text-safe: ink/paper, ink/paper-deep, ink-muted/paper, ink-muted/paper-deep, accent/paper, accent/paper-deep,
  danger/paper, danger/paper-deep, paper-on-ink fills, on-accent/accent, on-danger/danger, on-band/band,
  band-accent/band, on-stage/stage, on-attention/attention.
- UI-safe: rule-strong vs paper and paper-deep (control borders); attention vs stage.
- Decorative only: rule vs anything; ink vs accent; paper vs paper-deep. Never carry text or state with these.
- Danger and attention stay at least 25 degrees of hue from the accent: saffron must never read as an error.

## Typography
- Display: Marcellus 400 (`@fontsource/marcellus`): wordmark, headlines, card titles, numerals. One weight, no
  italic; `font-synthesis: none`, never bold.
- Labels: Karla Variable 500–600 (`@fontsource-variable/karla`): kickers, nav, buttons, metadata, field labels.
  Uppercase, letter-spacing 0.14em, 13px minimum.
- Text: Crimson Pro Variable with italics (`@fontsource-variable/crimson-pro`): body, italic decks, inputs. Runs small:
  body 20px / 1.6.
- **This reverses the old "no sans" rule.** Karla is the one sans, for labels only. Three families total.
- Scale: label 13px Karla · small 17 · body 20 / 1.6 · deck 22 italic · card title 29 · title 36 · numeral 34 ·
  wordmark 44 · headline clamp(40px → 68px).

## Shape language
- Square corners (controls 2px), no shadows. Separation by hairline rules; a thin double rule (1px, 3px gap, 1px) under
  the masthead and atop the ingredient sidebar.

## Density & spacing
- Generous whitespace. Measure 38rem for reading text, up to 44rem for forms and the grocery list, 90rem page. Gutter 16px
  phone / 40px ≥768. Wide screens (≥1280px, the recipe page ≥1440px) put help, tools or the recipe's note in a second
  column with its own measure.
- Listing entries: 24px vertical padding between hairlines. Touch targets 44px.
- Section separation: hairline rules only.

## Structure (app shell and screens)
- Top band: full-width charcoal strip (band tokens), at least 44px, on the page edges: local date · season · recipe
  count left (count left out when unknown), Sign out right; print hidden; season drops on a phone.
- Masthead: Marcellus wordmark (~44px) left, uppercase Karla section links right (active: 2px accent underline), thin
  double rule under.
- Home: featured recipe (text left, framed 3:2 photo right) → ticker → search + tag index → ruled tiles (3 columns from
  1280px) with a 22rem sidebar from 1024px.
- Recipe: split opener (tag kicker, headline, deck or none, byline, actions, photo right) → numerals band between a thin
  double rule and a hairline → drop-cap lede (long descriptions) → ingredient panel + numbered method (+ the note in a
  margin column from 1440px).
- Add, Edit, Import: form up to 44rem with a tips panel beside it from 1280px. Groceries: list up to 44rem, tools panel
  beside it. Settings: two columns of sections from 1280px.
- Auth: centred wordmark + tagline + double rule, form in a hairline frame, no band. Cook mode: full-screen evening
  overlay, no band.

## Motion
- Motion marks a change of state or place. One easing (`--ease-out`), durations 150-900ms, nothing loops except an
  active timer, a scan in progress or the in-season ticker; arrival staggers run once per visit, never on Back.
  Reduced motion removes movement and keeps colour changes. No GSAP: a reading app, restraint is the point. Tokens in
  `motion.css`; rules in `docs/UI.md` "Motion".

## Print inks (illustration only, no semantic token)
- Mustard `#d9a21b` (2.09:1 day, 8.03:1 evening) · Fern `#3f6b45` (5.60:1 day, 2.99:1 evening) · Tomato `#d2492a`
  (4.03:1 day, 4.16:1 evening). Mustard is decorative-only on day paper and too close to saffron to carry a meaning,
  fern is decorative-only on evening paper; tomato is for graphics (3:1), not text.

## Do not
- Use The New Yorker's name, logo, mascot, masthead, or Irvin / Irvin look-alike fonts; copy any publication's identity.
- Use next/font/google; use @fontsource packages only.
- Bold or italicise Marcellus; set running text in Karla; set a label under 13px or in lower case (no exceptions: the save
  stamp's lines are 13px too); add a fourth family.
- Use the saffron accent for an error, a destructive action or a "check this" mark (danger and attention own those).
- Rounded cards, drop shadows, gradients, pills, or accent fills larger than a button; thick-over-thin borders (a thin
  double rule or a 1px ink rule closes a block).
- Use magazine wording in anything a reader sees: volume, issue number, "cover story", "also in this issue", "edition",
  "forthcoming". The app is a household's recipe box and reads the same in five years (copy rules: `docs/UI.md`).
- Stretch a field or a paragraph across the 90rem page: wide screens get a second column, not longer lines.
- Hard-code a hex value outside `primitives.css`.

## Taste memory
- Profile priors used: none. Decision log: 2026-10-21 editorial magazine (ADR 0006); 2026-10-25 owner chose Riviera ·
  Charcoal & Saffron over Maison, Linen, Edition II and four Riviera variants (ADR 0009); the remaining screens, copy
  rules and wide-screen layouts follow in #122.
