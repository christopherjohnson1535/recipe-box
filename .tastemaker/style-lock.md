# Style lock — Recipe Box

Established: 2026-10-21. Source: user-specified direction (classic editorial magazine, literary-weekly feel; original
design, no trademarked names, logos or typefaces). No reference images; palette hand-set and matrix-checked.
Full guide for builders: `docs/UI.md`. Colour tokens live in `frontend/src/styles/` (primitives, themes/day + evening,
component tokens; see `docs/THEMING.md`), and this contract is enforced by `frontend/src/styles/tokens.test.ts`.

## Palette (light: "day edition")
- Paper `#fbf8f1` (page) · Paper-deep `#f3eee3` (ingredient sidebar, alerts)
- Ink `#1a1714` (text, primary button fill) — 16.83:1 on paper
- Ink-muted `#5c554c` (decks, bylines, metadata, hints) — 6.93:1 on paper, 6.35:1 on paper-deep
- Accent `#9b1c1c` deep red, sparingly (kickers, step numerals, links, active underline, focus) — 7.68:1 on paper
- Accent-hover `#7e1414` (9.91:1) · On-accent `#fbf8f1`
- Rule `#d9d1c3` decorative hairlines only · Rule-strong `#8c8377` control borders (3.52:1 paper, 3.22:1 paper-deep)
- Button label: paper on ink (16.83:1); paper on accent (7.68:1)

## Dark mode: runtime via prefers-color-scheme ("evening edition")
- Paper `#16130f` · Paper-deep `#211c17` · Ink `#efe8da` (15.19:1) · Ink-muted `#b3a999` (7.98:1 / 7.28:1)
- Accent `#d98c7f` desaturated red (7.06:1 on paper, 6.44:1 on paper-deep) · Accent-hover/focus `#e6a497` (8.92:1)
- Rule `#3a332b` decorative · Rule-strong `#7a7064` (3.82:1 on paper) · On-accent `#16130f`

## Color contract (check_contrast.py --matrix, both modes)
- Text-safe: ink/paper, ink/paper-deep, ink-muted/paper, ink-muted/paper-deep, accent/paper, accent/paper-deep,
  paper-on-ink fills, on-accent/accent.
- UI-safe: rule-strong vs paper and paper-deep (control borders).
- Decorative only: rule vs anything; ink vs accent; paper vs paper-deep. Never carry text or state with these.

## Typography
- Display: Libre Caslon Display 400 (`@fontsource/libre-caslon-display`), headlines, titles, wordmark, step numerals.
  One weight only; `font-synthesis: none`, never bold.
- Text: Newsreader Variable with opsz + italics (`@fontsource-variable/newsreader`): body, italic decks, labels.
- No sans. Two families total.
- Scale: label 14px uppercase +0.12em · small 16 · body 19 / 1.6 · deck 22 italic · title-sm 26 · title 36 ·
  headline clamp(40px → 72px).

## Shape language
- Square corners (controls 2px), no shadows. Separation by hairline rules; a thick-over-thin double rule under the
  masthead and atop the ingredient sidebar.

## Density & spacing
- Generous editorial whitespace. Measure 38rem body, 64rem wide column, 72rem page. Gutter 16px phone / 40px ≥768.
- Listing entries: 24px vertical padding between hairlines. Touch targets 44px.
- Section separation: hairline rules only.

## Structure (app shell)
- Masthead: wordmark left, uppercase section links right, double rule.
- Home: article-head (kicker, headline, italic deck, actions) → search + tag index → two-column contents listing.
- Recipe: centred article head (tag kicker, headline, deck or none, byline, actions) → meta strip → photo → drop-cap
  lede (long descriptions) → ingredient sidebar + numbered method → notes.
- Auth: centred wordmark + tagline + double rule, form in a hairline frame.

## Motion
- Colour/border transitions only (150ms). No GSAP: a reading app, restraint is the point. Reduced motion handled
  globally in globals.css.

## Do not
- Use The New Yorker's name, logo, mascot, masthead, or Irvin / Irvin look-alike fonts.
- Use next/font/google; use @fontsource packages only.
- Bold or italic display headlines; italics belong to decks, hints and notes.
- Rounded cards, drop shadows, gradients, pills, or accent fills larger than a button.

## Taste memory
- Profile priors used: none. Decision log: pending owner review of this editorial direction.
