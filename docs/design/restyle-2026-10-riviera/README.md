# Riviera restyle (October 2026): the decision

The owner compared four directions (Maison, Linen, Riviera, Edition II) and then four colour and font variants of
Riviera, and chose **Riviera · Charcoal & Saffron**: a more refined, less magazine-like look for a long-lived
household app. Record: ADR [0009](../../adr/0009-riviera-charcoal-saffron.md). Work: epic #118.

| Phase | Issue | Scope |
|---|---|---|
| 1 | #119 | Palette and fonts, both appearances (tokens only), ADR 0009, this record |
| 2 | #120 | Page width 90rem, charcoal top band, masthead, thin double rule |
| 3 | #121 | Home layout and evergreen copy, component renames |
| 4 | #122 | Every other screen, copy sweep, docs, wiki and screenshots (below) |

## Layout (for #120 and #121)
A charcoal top band (date · season · recipe count, Sign out), wordmark left with section links right, a thin double
rule, a featured recipe with a framed 3:2 photo, cards ruled across the top, band-coloured panels. Page 90rem (was
72rem), a 3-column recipe grid on desktop; the reading measure is unchanged. Copy reads the same in five years: no
volumes, issue numbers, "cover stories" or "also in this issue".

## Palette (semantic tokens)
WCAG 2 contrast; `frontend/src/styles/tokens.test.ts` holds every pairing.

| Token | Day | Evening | Notes |
|---|---|---|---|
| `--color-paper` | `#f4f4f1` | `#121416` | cool off-white / near-black slate |
| `--color-paper-deep` | `#eaeae5` | `#1b1e21` | |
| `--color-ink` | `#22262b` | `#eeede8` | 13.8:1 / 15.8:1 on paper |
| `--color-ink-muted` | `#565c63` | `#a9aeb4` | 6.1:1 / 8.3:1 on paper; 5.6:1 / 7.5:1 on paper-deep |
| `--color-rule` | `#d8d9d3` | `#2e3236` | decorative only |
| `--color-rule-strong` | `#7d8288` | `#6d7379` | control borders: 3.5:1 / 3.2:1 day, 3.9:1 / 3.5:1 evening |
| `--color-accent` | `#8a5c0c` | `#e0b057` | deep saffron; 5.3:1 / 9.3:1 on paper, 4.8:1 / 8.4:1 on paper-deep |
| `--color-accent-hover` | `#6f4a09` | `#ecc57a` | 7.2:1 / 11.3:1 on paper |
| `--color-on-accent` | `#f4f4f1` | `#121416` | |
| `--color-focus` | = accent | = accent | |
| `--color-danger` | `#a33a2b` | `#ef9a8a` | brick red, **no longer the accent**: 6.0:1 / 8.5:1 on paper |
| `--color-danger-hover` | `#86301f` | `#f5b3a6` | added for the danger button (it used the accent before) |
| `--color-on-danger` | `#f4f4f1` | `#121416` | 6.0:1 / 8.5:1 on danger |
| `--color-attention` / `--color-on-attention` | `#6fb5bd` / `#22262b` | same | sea teal, retuned from mustard (see below) |
| `--color-stage` / `--color-on-stage` | `#1b1e21` / `#eeede8` | same | cook-mode darkroom, charcoal instead of umber; 14.3:1 |
| `--color-band` / `--color-on-band` / `--color-band-accent` | `#22262b` / `#f4f4f1` / `#e9b75a` | `#22262b` / `#eeede8` / `#e0b057` | the charcoal top band and inverse panels (#120); 13.8:1 and 8.3:1 day, 13.0:1 and 7.6:1 evening |

**Attention.** The issue kept mustard only if it still read as distinct from the saffron accent. It did not: mustard
`#d9a21b` is hue 43, saffron hue 38, and a flagged import row looked like an accent. Sea teal `#6fb5bd` (hue 186) is
the nearest colour that keeps every attention pairing: charcoal ink on it 6.5:1, 7.2:1 against the stage, and the
20% wash under ink and accent text stays above 4.5:1 (accent on the day wash 4.57:1).

## Fonts
All from `@fontsource` / `@fontsource-variable`, imported in `frontend/src/app/layout.tsx`. Libre Caslon Display and
Newsreader are removed.

| Role | Family | Notes |
|---|---|---|
| Display: wordmark, headlines, card titles, numerals | **Marcellus** 400 | one weight: `font-synthesis: none`, never bold or italic |
| Labels: kickers, nav, buttons, metadata, field labels | **Karla** 500–600 | uppercase, letter-spacing 0.14em, 13px minimum |
| Text: body, italic decks, inputs | **Crimson Pro** (variable, with italics) | runs small: body 20px / 1.6 |

This **reverses the "no sans" rule** of the editorial design: Karla is the one sans, for labels only.

## Type scale (starting point, tuned by eye)
label 13px Karla · small 17px · body 20px · deck 22px italic · card title 29px · title 36px · numeral 34px ·
wordmark 44px · headline clamp(2.5rem → 4.25rem).

## Icons
The R monogram is redrawn in Marcellus: paper `#f4f4f1` on band charcoal `#22262b` with a band-saffron `#e9b75a`
rule. How to regenerate: `frontend/public/icons/README.md`.

## Screens after #122
Captured from a seeded local stack (production build), 1600px desktop and iPad (1024px landscape, 768px upright), in the
day and evening appearances. JPEG crops of the top of each page. The home page is shown in the #121 record.

| File | Screen | Width |
|---|---|---|
| `desktop-recipe-day.jpg`, `desktop-recipe-evening.jpg` | Recipe: ingredients, method and the note in the margin column | 1600 |
| `desktop-groceries-day.jpg`, `desktop-groceries-evening.jpg` | Groceries: list beside the tools panel | 1600 |
| `desktop-settings-day.jpg`, `desktop-settings-evening.jpg` | Settings in two columns | 1600 |
| `desktop-add-day.jpg` | Add a recipe with the tips panel | 1600 |
| `desktop-import-evening.jpg` | Import with "What happens next" | 1600 |
| `desktop-sign-in-day.jpg` | Sign in | 1600 |
| `desktop-save-stamp-evening.jpg` | The "In the box · Saved" stamp | 1600 |
| `ipad-recipe-day.jpg` | Recipe, long description with drop cap and a long note | 1024 |
| `ipad-recipe-evening.jpg` | Same recipe, single column | 768 |
| `ipad-groceries-evening.jpg` | Groceries, tools panel under the list | 768 |
| `ipad-settings-day.jpg` | Settings, one column | 1024 |
| `ipad-cook-evening.jpg` | Cook mode on the dark stage (no band) | 1024 |
