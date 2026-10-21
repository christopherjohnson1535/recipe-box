# R4 code review: issue #2 design system (branch issue-2-design-system)

Load assumed: one household, a few users. Checked: vitest (137 pass), tsc, lint all clean. Compiled CSS in
`.next` confirms `border-transparent` still works after `--color-*: initial`, and the dark overrides land after
the `@theme` layer (so they win). No hex or font names in `components/ui`. Every component token is both defined
and used; no token is read that is not defined. Findings below are test gaps, one visual regression and cleanup.

## Must

### R4-01 Must  `frontend/src/styles/page-styling.test.ts:25` (regex) and `:48` (file filter)
The guard that is the point of the issue can be bypassed. Each of these passes the test today (checked with the
same regex):
- Template literal with no closing quote inside: `className={`text-accent ${x}`}` (the `{([^}]*)}` capture stops at
  the first `}`, and the inner string regex finds no quote pair).
- Single quotes: `className='text-accent'` (only `"..."` and `{...}` are matched).
- Indirection: `const c = "text-accent"; <p className={c}>` and `<p {...{ className: "bg-paper" }}>`.
- Other prop names (`labelClass="..."`), and any `.ts` file (only `.tsx` is scanned), so
  `lib/styles.ts` exporting class strings used by a page passes.
- Any folder named `ui` under `app/` is skipped (`name === "ui"` at any depth), e.g. `src/app/ui/page.tsx`.
Smallest fix: in non-ui files allow only `className="<literal>"` (either quote); fail on any `className={...}`
whose content is not a single string literal, on `{...` spreads containing `className`, and on `class`/`*Class`
props. Only skip `src/components/ui` by path, not by folder name. Also scan `src/lib/**/*.ts`.

## Should

### R4-02 Should  `frontend/src/styles/tokens.test.ts` (no test) / `components/ui/*.tsx`
Nothing checks that a `-(--x)` used in ui is defined. Failing case: change `text-(--kicker-fg)` in
`ui/Chip.tsx:7` to `text-(--kicker-fgg)`; Tailwind emits `color: var(--kicker-fgg)`, which is invalid, so the text
silently inherits; all tests pass. Fix: add a test that globs `components/ui/*.tsx` and `app/globals.css`, collects
`\(--[a-z0-9-]+\)` / `var(--...)`, and expects each to be in `components.css`, a semantic token, or an allowlist
of layout tokens. The same scan can fail on unused component tokens.

### R4-03 Should  `tokens.test.ts:55-100` (contrast contract)
Pairings ui really uses that are not in `TEXT`/`UI`, so a retune can fail without a red test:
- `--chip-fg-hover` on paper (Chip hover text). Set `--chip-fg-hover: var(--color-paper)`: hover text vanishes, tests pass.
- `--drop-cap-fg` on paper (`.drop-cap`). Set it to `--color-paper`: invisible drop cap, tests pass.
- `--color-ink` / `--color-ink-muted` on `--panel-bg` (Sidebar body text). The token exists to be retuned apart from
  paper-deep, but only `--kicker-fg` on it is tested, and the sidebar has no kicker. Wrong pair tested.
- `--input-border-hover`, `--chip-underline-hover`, `--alert-rule` on their backgrounds (3:1 group).
- `--button-ghost-underline` is `--color-rule` (about 1.4:1 on paper) and is the ghost button's only affordance
  beyond its text. Same as `main`, but now documented as decorative; consider `--color-rule-strong`.
Fix: add the pairs above to `TEXT`/`UI`. Better, derive the list: each component token read in ui should have an
explicit fg/bg entry, and a test fails if a `-fg`/`-bg` token has no entry.

### R4-04 Should  `frontend/src/components/ui/Contents.tsx:32` (visual regression vs main)
On `main` the card's tag list was `<ul class="label dot-list ... text-accent">`. Now `RecipeCard` passes a
`DotList` with tone `inherit`, so the ul is no longer `.label`; only each Badge span is. Result: the `·` separators
(`::after` on the li) are sized from the 19px body font instead of 14px, and the row takes body line-height 1.6
instead of 1.35, so the kicker row is taller and its dots larger and not tracked. The recipe page kicker is
unaffected (PageHeader wraps it in `.label`). Fix: render the kicker as `{kicker && <div className="label">{kicker}</div>}`
in `ContentsEntry`.

### R4-05 Should  `frontend/src/styles/tokens.test.ts:41-45` (theme scope)
The test reads each theme file as flat text, so scope is never checked. Failing cases that pass: remove the
`@media (prefers-color-scheme: dark)` wrapper from `evening.css` (dark colours always on, light never shows), or
change it to `light`. `color-scheme` is also untested. The `delete all["--color-*"]` line is dead code (the
decl regex cannot match `*`). Fix: assert `evening.css` contains `@media (prefers-color-scheme: dark)` and
`color-scheme: dark`, `day.css` contains `@theme static` and no `@media`, and drop the dead delete.

### R4-06 Should  `frontend/src/app/layout.tsx:21-22`, `public/manifest.webmanifest:8-9`
The paper hex is copied in three more places (themeColor light/dark, manifest background/theme) with a "keep in
sync" comment and no test. Change `--cream-50` and the PWA chrome keeps the old colour. Fix: in `tokens.test.ts`,
read `layout.tsx` and the manifest and expect `#fbf8f1` equals primitive of day `--color-paper` and `#16130f` equals
evening's.

## Nice

### R4-07 Nice  `frontend/src/components/Placeholder.tsx:20`
`<span class="not-italic font-semibold">` became `<strong>` (via `Text as="strong"`). Reads as emphasis to screen
readers, which is fine but is a semantics change from `main`; the JSX also formats oddly (`<Text ...>` opening
mid-line). Keep, or use `as="span"`.

### R4-08 Nice  `frontend/src/components/ui/Contents.tsx:7`, `app/(app)/page.tsx:132`
The listing `ul` now has `aria-label="Recipes"` inside a `section` named "All recipes" / "N matching recipes", so
screen readers announce two names for one list. Drop the label or the section name.

### R4-09 Nice  `frontend/src/styles/page-styling.test.ts:25-28`
False positive: `className={buttonClass("secondary")}` is reported as violation `secondary` (every string inside
braces is treated as a class). Nudges people to workarounds. Fix: ignore strings that are arguments of
`buttonClass(`.

### R4-10 Nice  a11y
- `ui/SkipLink.tsx:6`: `py-3` (24px) + label line-height 14px x 1.35 = about 43px, 1px under 44. Use `min-h-control` + `inline-flex items-center`.
- `ui/Masthead.tsx:14` and `app/(app)/page.tsx:97`: `overflow-x-auto` on the nav also clips vertically, and the
  focus ring is `outline-offset: 3px` + 2px, so the ring on the first/last link and top/bottom edges is cut off.
  Same as `main`, not new; add `py-1.5` to the nav, or `outline-offset: -2px` inside these navs.

### R4-11 Nice  unused variants and tokens (ponytail)
No caller anywhere: `Text` variants `body` and `small` (and so the default), `Heading size="title-sm"`,
`DotList tone="meta"`, `Rule variant="hair"`, `Button` variants `ghost` and `danger` (these two carry 7 component
tokens and 5 contrast pairs). `--text-wordmark*`, `--text-numeral` are used. Remove the unused variants, or keep
them and accept the cost; do not add more until a page needs them.

## Checked, no finding
- Heading levels, `aside`/`section` `aria-labelledby` ids (`ingredients`, `steps`, `notes`), `Tags` list label, nav
  `aria-label="Main"`, logo link `aria-label`, `aria-current` on Chip/NavLink, Sign out `title` all unchanged.
- Chip count stays muted in both states (`--chip-fg`), same as `main`.
- Logo: `leading-none` replaced by `--text-wordmark--line-height: 1`; sizes equal (`sm:` step became a clamp between
  30px and 34px, a small deliberate-looking change).
- Byline source line: `Text aside` has the same resets as the old inline classes.
- Dark override ordering, `@theme static`, `bg-(--x)` colour inference (colour, not length), `border-transparent`
  all fine in the compiled CSS.
