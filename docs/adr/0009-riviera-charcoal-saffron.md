# 0009. Riviera · Charcoal & Saffron palette and Marcellus / Karla / Crimson Pro fonts

Status: Accepted · Date: 2026-10-25 · Supersedes the palette and font parts of [0006](0006-editorial-design-system.md)

## Context
Recipe Box is a long-lived household app, used daily on an iPad in the kitchen and on a desktop. The editorial
magazine look (cream paper, one claret accent, Libre Caslon Display and Newsreader, issue numbers and cover stories)
read as a magazine rather than a calm tool, and its claret accent doubled as the danger colour, so ordinary
emphasis and errors looked alike. The owner wanted something more refined and less magazine-like that would still
feel right in five years. He compared four directions (Maison, Linen, Riviera, Edition II), then four colour and
font variants of Riviera, and chose **Riviera · Charcoal & Saffron**. Epic #118 carries it out in four issues.

## Decision
- **Palette.** Cool off-white paper and charcoal-slate ink with one deep saffron accent; an evening appearance in
  near-black slate with a brighter saffron. Danger is its own brick red and never the accent. "Check this"
  (attention) moves from mustard to sea teal, since mustard sat beside saffron. New band tokens (`--color-band`,
  `--color-on-band`, `--color-band-accent`) name the charcoal top band and inverse panels, dark in both editions.
  Exact values and contrast: `docs/design/restyle-2026-10-riviera/README.md`.
- **Fonts.** Marcellus 400 for display (wordmark, headlines, card titles, numerals; never bold or italic), Karla for
  uppercase tracked labels (13px minimum), Crimson Pro with italics for reading text at 20px. All from
  `@fontsource` / `@fontsource-variable`. This reverses the old "no sans" rule: Karla is the one sans, for labels only.
- **Unchanged.** The three token layers (primitives, semantic themes, component tokens), the guard tests, the day and
  evening editions and how they are chosen, the originality rule, and the accessibility minimums from 0006.

## Consequences
- The whole app restyles from the token files, `globals.css` and the font imports; components keep reading tokens.
- The contrast contract gains danger, on-danger and band pairings, and a test keeps danger and attention at least
  25 degrees of hue away from the accent in every theme.
- The app icons are regenerated: a Marcellus R in paper on the charcoal band colour with a saffron rule.
- Later issues build on these tokens: page width, top band and masthead (#120), home layout and evergreen copy (#121),
  every other screen and the wiki (#122). Layout parts of 0006 and `docs/UI.md` stay until those land.
- Photo plates (`backend/src/plate.rs`) still warm whites toward the old cream paper; whether to cool them is left to
  a later issue so this change stays in the frontend.
