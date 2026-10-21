# Theming Recipe Box

How the colours are wired, how to change them, and how to add a theme. The look itself (what the tokens are
*for*) is in `docs/UI.md`; the locked palette and contrast contract are in `.tastemaker/style-lock.md`.

## Three layers

```
primitives            semantic (per theme)          component                    used by
--cream-50   ─────►   --color-paper        ─────►   --button-primary-fg   ─────► components/ui/Button.tsx
--stone-950  ─────►   --color-ink          ─────►   --button-primary-bg
--claret-700 ─────►   --color-accent       ─────►   --kicker-fg, --link-fg ...
```

| Layer | File | What it holds | Who may read it |
|---|---|---|---|
| 1. Primitives | `frontend/src/styles/primitives.css` | Raw hex values named by what they look like (`--cream-50`, `--umber-900`, `--claret-700`) | Theme files only |
| 2. Semantic | `frontend/src/styles/themes/day.css`, `evening.css` | What a colour means: `--color-paper`, `--color-ink`, `--color-ink-muted`, `--color-rule`, `--color-rule-strong`, `--color-accent`, `--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-focus` | ui components (as `bg-paper`, `text-ink`...), component tokens, `globals.css` base styles |
| 3. Component | `frontend/src/styles/components.css` | One decision inside one component: `--button-primary-bg`, `--input-border`, `--chip-underline-selected`, `--panel-bg`, `--numeral-fg`, `--focus-ring`... | `frontend/src/components/ui/*` only, written as Tailwind arbitrary values: `bg-(--button-primary-bg)` |

Pages and app components (`src/app/**`, `src/components/*.tsx`) never touch colour, type or borders. They compose
ui components and use layout utilities (flex, grid, gap, padding, widths such as `max-w-page`, `px-gutter`).

`day.css` is written as Tailwind `@theme static`, which is what creates the `bg-paper`/`text-ink`/`border-rule`
utilities. Tailwind's own colour palette is switched off (`--color-*: initial`), so a class like `text-red-600`
produces nothing. Type scale, fonts, radius and easing don't change between themes and live in `globals.css`.

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
   `@media (prefers-color-scheme: dark)`; a forced theme needs the attribute selector instead.
5. Run the guard tests. The theme is picked up automatically: they fail if it misses a token or any pairing in the
   contract drops below its contrast floor.
6. Update `.tastemaker/style-lock.md` with the new palette and `themeColor` in `frontend/src/app/layout.tsx` if
   the page colour differs.

## Guard tests (`frontend/src/styles/*.test.ts`, run by `npx vitest run`)
- `tokens.test.ts`
  - every theme file defines exactly the semantic tokens in `day.css`, each from a primitive hex;
  - every component token points at a semantic token (non-colour tokens such as `--photo-filter` are listed as
    exceptions and set per scheme in `components.css`);
  - every theme file has its scope: `day.css` is `@theme static` with no media query, `evening.css` is inside
    `prefers-color-scheme: dark` and sets `color-scheme: dark`;
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
