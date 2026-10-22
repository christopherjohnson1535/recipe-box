# Phase 1 review: frontend UI and standards (R4/V1)

Scope: every page as merged on `issue-9-phase1-review`, live app at 390 and 1024 px, light and dark, Chromium + axe-core 4.x. `npx tsc --noEmit` clean; `npx vitest run` 332/332 pass. No console errors or hydration warnings on any page (only the expected 404 resource lines on bad ids). Earlier FIXES.md items checked and still holding: ChipRow wrap (D-01), reserved deck (D-11), photo filter, ui-only styling guard (R4-01, `className` outside ui is literal layout utilities only), SkipLink, form `method`, theme-color tokens.

Counts: Must 0, Should 5, Nice 9.

## Should

**F-01 Should** `frontend/src/components/ui/EmptyState.tsx:9` hard-codes `<h2>`; `NotFoundContent`, `ErrorContent` and `app/(app)/not-found.tsx` render it as the only heading. Case: `/nope`, `/recipes/abc`, `/recipes/<unknown uuid>`, `/recipes/new/edit` fail axe `page-has-heading-one` (and the error boundary has no h1). Fix: add `level?: 1 | 2` to EmptyState (default 2) and pass `level={1}` from NotFoundContent and ErrorContent (and Placeholder keeps its PageHeader h1).

**F-02 Should** `frontend/src/components/import/import-errors.ts:52-57`. The "full web address" rewrite is gated on `/url/i.test(rest)`, but the API message (`backend/src/routes/imports.rs:47`) is "url: enter a full web address starting with http:// or https://." which does not contain "url", so the raw lowercase backend text shows. Case: /import, type `notaurl`, Enter: field error reads "enter a full web address starting with http:// or https://." (lowercase, different from the #7 P2-2 wording). Fix: for `name === "url" || name === "sourceUrl"` always use `web`; drop the regex.

**F-03 Should** no `loading.tsx` anywhere (`frontend/src/app/(app)/`). Every page awaits the API in a server component, so a slow API gives no feedback after a click (nav active state, button and link do not change). Vercel: skeletons/loading states. Fix: add `app/(app)/loading.tsx` rendering a quiet `Pending` note (or a PageHeader-shaped placeholder) inside `main`.

**F-04 Should** `frontend/src/components/ui/Chip.tsx:31` `whitespace-nowrap` with no max width. Case: a recipe with a 60-character tag makes the home tag row 749 px wide at 390 px; `html { overflow-x: clip }` hides the rest, so the chip text and its count are cut off and unreadable. Fix: `max-w-full` plus `whitespace-normal [overflow-wrap:anywhere]` (or `truncate` with `title`) on Chip.

**F-05 Should** long free text overflows and is clipped at 390 px on the recipe page (`/recipes/<id>`, test recipe with unbroken strings). Offenders: byline source name in `recipes/[id]/page.tsx:59` (plain text, no wrap; the link has `break-words`), `MetaStrip` servings value, `Lede` paragraph. Realistic case: a 150-character source name or serves value without spaces; a pasted URL as description. Fix: `[overflow-wrap:anywhere]` on `Text`, `MetaStrip` values and `Lede` in `ui/Article.tsx`/`ui/Text.tsx`.

## Nice

- **F-06** Focus lands on `<body>` after every navigation (sign-in, open recipe, Edit, save redirect, Import); the skip link makes this survivable but there is no focus move to the new `h1` or a "Saved" confirmation after saving (`RecipeEditor.tsx:12`). Fix: after `router.push` show a saved notice, or give PageHeader h1 `tabIndex=-1` and focus on route change.
- **F-07** No autofocus on the primary input on desktop: `/login` username (`LoginForm.tsx`), home search. Vercel "autofocus primary input on desktop".
- **F-08** Straight quotes in toast copy, `components/undo/UndoToast.tsx:72,73,95` (`"${offer.title}"`); the rest of the UI uses curly quotes. Fix: `“…”`.
- **F-09** Titles: home is bare "Recipe Box", not-found and error pages have no title, edit page is "Edit recipe" without the recipe name. Fix: `export const metadata = { title: "Recipes" }` on home, `{ title: "Page not found" }` in both not-found files, `generateMetadata` on edit.
- **F-10** No `app/global-error.tsx`: a root-layout failure shows Next's unstyled default.
- **F-11** Copy and variant drift between agents: "Try again" is secondary in `RetryButton.tsx:11` but primary in `ErrorContent.tsx:10` and `ImportScreen.tsx:310`; "Type it in" / "Type one in" / "Type it in instead" (`page.tsx:68`, `ImportPanels.tsx:105`, `ImportScreen.tsx:315`); empty home shows two primaries (Add recipe in header, Import from a link in the empty state).
- **F-12** Placeholder `https://example.com/best-pancakes…` (`ImportPanels.tsx:36`) ends in an ellipsis that reads as part of the URL; use the example without "…" or `https://…` like the other two.
- **F-13** Small inline hit areas: Contents title link 31 px high (whole entry is clickable, so only the link box), recipe source link 16 px (`ExternalLink`), Settings "AI Photo Import" link 16 px. Radios are 20 px but sit in 44 px label rows (pass). Fix: `inline-block min-h-control` is overkill for inline text; acceptable at 24 px minimum per Vercel desktop rule, bump source link to `py-2`.
- **F-14** Unmatched URLs (`/nope`) use root `not-found.tsx`, which has no masthead, so a signed-in user has only the "Back to recipes" button; fine, but the Edit-with-bad-id 404 shows the header (inconsistent).

## Keyboard walk (Playwright, 1024 px)
Sign in (Tab order: skip link, username, password, Sign in; Enter submits) then home 26 stops, search input keeps focus and caret after debounce and Enter, Tab to recipe link, Enter opens it, Edit via keyboard, edit form 23 stops, Enter in title saves and redirects, Import: invalid URL error focuses the url input, Tabs arrow keys move focus and `?mode=`, Settings 16 stops. No focus trap, no invisible focus (every stop has a 2 px solid outline; the sr-only file input inside PhotoField is shown by its label via `has-[:focus-visible]`), no unreachable control. Only finding: focus to body after navigation (F-06).

## Vercel guidelines (pass/fail)
| Area | Result | Notes |
|---|---|---|
| Forms: labels, autocomplete, spellcheck, 16px inputs | Pass | all inputs 19 px, `autocomplete` correct on auth and settings, spellcheck off on url/username/password |
| Forms: errors next to field, focus first error, unsaved warning | Pass | import and editor verified (F-02 is wording) |
| Forms: submit not pre-disabled, pending label | Pass | |
| Forms: placeholders end with "…" | Pass with note | F-12 |
| Focus: visible, `:focus-visible`, not covered | Pass | 2 px ring everywhere walked |
| Images: width/height, lazy | Pass | thumbnails 160x120 `lazy`; lead photo 1200x800 eager (above fold, correct) |
| Navigation and state in URL | Pass | `?q`, `?tag`, `?sort`, `?mode`, `?url` |
| Touch: 44 px, tap highlight, touch-action | Pass with note | tap-highlight transparent, `touch-action: manipulation` on body; F-13 |
| Layout: no horizontal scroll at 390 | Pass (viewport) | `scrollWidth == clientWidth` on every page; but see F-04/F-05, overflow is clipped not absent |
| Theming: `color-scheme`, theme-color | Pass | day light / evening dark, metas match `--color-paper` (tested by tokens.test.ts) |
| Locale: Intl dates | Pass | `LocalDate` client-formatted; recipe counts use numerals |
| Content handling: long text | Fail | F-04, F-05 |
| Titles per page | Partial | F-09 |
| Heading hierarchy | Partial | F-01; otherwise h1, h2, h3 in order on all pages |
| Loading states | Fail | F-03 |
| Curly quotes, single ellipsis, no em dashes | Pass with note | no em dashes in UI copy (en dashes only in ranges); F-08 |

## axe-core (all pages, 390 light and 1024 dark)
Zero violations on /login, /, /recipes/[id] (6 recipes), /recipes/[id]/edit, /recipes/new, /import (all 3 modes), /settings, cook placeholder, no-results. Violations: `page-has-heading-one` (moderate) on the four not-found routes only (F-01).

## Next.js
- Client components all need client APIs (state, events, router); `RecipeEditor` is the thinnest but needs `useRouter`. Nothing to demote.
- Hydration: no warnings. `metadata`: present on every route except home and not-found (F-09). `error.tsx` at root and `(app)`; `loading.tsx` none (F-03); `global-error.tsx` none (F-10). Bad ids give `notFound()` (400 and 404 handled) on recipe and edit pages.

## Design-system guard health
`page-styling.test.ts` and `tokens.test.ts` pass. Outside `components/ui` the only classes are layout utilities (flex, grid, gap, padding, widths, `sr-only`, `text-center`, `-ml-2`); one `text-left` in `recipe-page/DeleteRecipeButton.tsx:50` is outside the documented list but harmless. No inline `style`, no hex colours (only the viewport `themeColor`, which the tokens test checks). No ui component is unused; unused variants (Alert info, Rule hair, Heading title-sm, IconButton quiet) were deliberately kept in R4-11 and are not re-reported.

Test data note: one keyboard save on an existing smoke recipe (Lemon drizzle cake, title unchanged) touched its `updatedAt`; my long-text test recipe was deleted.
