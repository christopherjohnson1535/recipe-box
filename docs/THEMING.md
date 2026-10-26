# Theming Recipe Box

How the colours are wired, how to change them, and how to add a theme. The look itself (what the tokens are
*for*) is in `docs/UI.md`; the locked palette and contrast contract are in `.tastemaker/style-lock.md`.

## Three layers

```
primitives            semantic (per theme)          component                    used by
--chalk-50    ─────►   --color-paper        ─────►   --button-primary-fg   ─────► components/ui/Button.tsx
--slate-900   ─────►   --color-ink          ─────►   --button-primary-bg
--saffron-700 ─────►   --color-accent       ─────►   --kicker-fg, --link-fg ...
--brick-700   ─────►   --color-danger       ─────►   --button-danger-bg, --input-border-invalid ...
```

| Layer | File | What it holds | Who may read it |
|---|---|---|---|
| 1. Primitives | `frontend/src/styles/primitives.css` | Raw hex values named by what they look like (`--chalk-50`, `--slate-900`, `--saffron-700`, `--brick-700`, `--sea-400`, print inks `--mustard-500`, `--fern-700`, `--tomato-600`) | Theme files only |
| 2. Semantic | `frontend/src/styles/themes/day.css`, `evening.css` | What a colour means: `--color-paper`, `--color-ink`, `--color-ink-muted`, `--color-rule`, `--color-rule-strong`, `--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-danger-hover`, `--color-on-danger`, `--color-focus`, `--color-attention`, `--color-on-attention`, `--color-stage`, `--color-on-stage`, `--color-band`, `--color-on-band`, `--color-band-accent` | ui components (as `bg-paper`, `text-ink`...), component tokens, `globals.css` base styles |
| 3. Component | `frontend/src/styles/components.css` | One decision inside one component: `--button-primary-bg`, `--input-border`, `--chip-underline-selected`, `--panel-bg`, `--numeral-fg`, `--focus-ring`... | `frontend/src/components/ui/*` only, written as Tailwind arbitrary values: `bg-(--button-primary-bg)` |

Pages and app components (`src/app/**`, `src/components/*.tsx`) never touch colour, type or borders. They compose
ui components and use layout utilities (flex, grid, gap, padding, widths such as `max-w-page`, `px-gutter`).

`day.css` is written as Tailwind `@theme static`, which is what creates the `bg-paper`/`text-ink`/`border-rule`
utilities. Tailwind's own colour palette is switched off (`--color-*: initial`), so a class like `text-red-600`
produces nothing. Type scale, fonts, radius and easing don't change between themes and live in `globals.css`.

## The Riviera palette (October 2026, ADR 0009)
Charcoal & Saffron replaced the cream, umber and claret palette. Values and contrast figures are in `docs/UI.md`
("Tokens") and `docs/design/restyle-2026-10-riviera/README.md`; the guard tests below hold every pairing. Three
decisions worth knowing before you change a colour:

- **Danger is no longer the accent.** The claret accent used to double as the danger colour. Saffron reads as warmth,
  not as an error, so `--color-danger` is its own brick red (`--brick-700` by day, `--brick-300` by evening) with
  `--color-danger-hover` and `--color-on-danger` for the danger button. `tokens.test.ts` fails if danger or attention
  comes within 25 degrees of hue of the accent.
- **Attention moved from mustard to sea teal.** Mustard (`#d9a21b`, hue 43) sat next to saffron (hue 38) and a
  flagged import row read as "accent", not "check this". `--color-attention` is now `--sea-400` (`#6fb5bd`) in both
  appearances: still a wash, rule or mark only, charcoal ink on it (6.5:1), 7.2:1 against the darkroom stage, and the
  20% wash keeps ink and accent text above 4.5:1. Mustard stays a primitive print ink with no meaning attached.
- **The band.** `--color-band`, `--color-on-band` and `--color-band-accent` are the charcoal top band and inverse
  panels. They are dark in both appearances (evening only softens the text a touch) and are paired in the contract now,
  before the shell issue (#120) uses them.

## Appearances: how day and evening are chosen
Day is the default token set (`:root`, from `day.css`). Evening is the same names redefined in `evening.css` (and the
component tokens that evening re-points, such as `--photo-filter`, `--rule-double`, `--photo-outline` and `--feature-edge`, in `components.css`) under two selectors with identical
values:

- `:root[data-theme="evening"]`: set by script, wins over everything.
- `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`: when no attribute is set (no JavaScript, or the
  device preference). `data-theme="day"` therefore always beats a dark device.

Print (`globals.css`) overrides both so paper is white however the appearance was chosen.

Which appearance shows is a per-device preference in `localStorage["rb-edition"]`: `clock` (default; evening 19:00 to
06:59 local), `day`, `evening` or `device` (leave `data-theme` off). `src/lib/edition.ts` holds the rules
(`resolveEdition`, `msUntilNextSwitch`) and `EDITION_SCRIPT`, built from the same constants. The root layout puts that
script in `<head>`, so `data-theme` is set before first paint (`<html suppressHydrationWarning>`).
`components/edition/EditionController` (mounted once in the layout, renders nothing) re-applies it at the next
07:00/19:00, when the tab becomes visible, on a `storage` event and when the device scheme changes, and rewrites
`<meta name="theme-color">` to the paper colour so the iPad status bar matches. Settings, Appearance changes the
preference and applies it at once. `PAPER` in `edition.ts` is checked against the tokens by `tokens.test.ts`.
The older word "edition" survives only as an internal name (`edition.ts`, `rb-edition`, `EditionController`); it never
reaches a reader.

## Changing a colour
- **Everywhere a meaning is used** (say, a warmer paper): change the primitive the theme points at, or point the
  semantic token at another primitive. Do it in every theme that should change.
- **In one component only** (say, a red primary button): change that component token in `components.css`
  (`--button-primary-bg: var(--color-accent)`). No component code changes.
- **A brand-new colour**: add a primitive, then reference it from a theme. Never put a hex value in a theme,
  component token or component.

Then run `npx vitest run src/styles` (see "Guard tests").

## Adding a theme
A theme is one file in `frontend/src/styles/themes/` that sets **every** semantic token from `day.css` to a
primitive, under a selector. Example, a high-contrast "large print" theme:

1. Add any new primitives to `primitives.css`.
2. Create `themes/large-print.css`:
   ```css
   [data-theme="large-print"] {
     color-scheme: light;
     --color-paper: var(--paper-white);
     --color-ink: var(--ink-black);
     /* ...every other --color-* token from day.css */
   }
   ```
3. Import it in `frontend/src/app/globals.css` after `evening.css`.
4. Switch to it by setting `data-theme="large-print"` on `<html>` (a settings toggle would store the choice and
   set the attribute before first paint). `evening.css` follows the device's dark mode with
   `@media (prefers-color-scheme: dark)` plus `:root[data-theme="evening"]`; a new theme uses the attribute selector,
   and `edition.ts` must learn to set it.
5. Run the guard tests. The theme is picked up automatically: they fail if it misses a token or any pairing in the
   contract drops below its contrast floor.
6. Update `.tastemaker/style-lock.md` with the new palette and `themeColor` in `frontend/src/app/layout.tsx` if
   the page colour differs.

## Guard tests (`frontend/src/styles/*.test.ts`, run by `npx vitest run`)
- `tokens.test.ts`
  - every theme file defines exactly the semantic tokens in `day.css`, each from a primitive hex;
  - every component token points at a semantic token (non-colour tokens such as `--photo-filter` are listed as
    exceptions and set per scheme in `components.css`);
  - every theme file has its scope: `day.css` is `@theme static` with no media query, `evening.css` has the
    `[data-theme="evening"]` block and the dark-device `:root:not([data-theme])` block, both with `color-scheme: dark`
    and identical values (the same check covers the evening overrides in `components.css`, among them `--photo-filter`, `--rule-double`, `--photo-outline` and `--feature-edge`);
  - `PAPER` in `lib/edition.ts` equals each theme's `--color-paper`;
  - print inks: each ink's contrast on day and evening paper is recorded (text-safe, graphic or decorative only);
  - decorative component tokens (`--skeleton-bg`, `--skeleton-shine`) are listed with a reason instead of a pairing;
  - danger and attention stay at least 25 degrees of hue away from the accent in every theme;
  - every `(--x)` / `var(--x)` read by `components/ui` and `globals.css` is defined, and every component token is read;
  - every `-fg` / `-bg` component token has a contrast pairing below;
  - `themeColor` in `app/layout.tsx` and the manifest colours equal the resolved `--color-paper` of day and evening;
  - in every theme, each text pairing in the contract is at least 4.5:1 and each control pairing (borders that
    show a control, focus rings, state underlines) at least 3:1. The contract lists the style-lock pairs plus each
    component token pair (button label on button fill, input text on input, chip text on paper...). When you add a
    component token that carries text or state, add its pairing there.
- `page-styling.test.ts`: every `.ts`/`.tsx` in `app`, `components` and `lib` outside `src/components/ui/` (that
  exact path) may use only a literal `className="…"` of layout classes: no `className={…}`, single quotes, template
  literals, spreads carrying className, `*Class` props or helpers, no `style={…}` and no `ui/cx`. If it fails, move the styling into a ui component (or add a variant) and use that.
