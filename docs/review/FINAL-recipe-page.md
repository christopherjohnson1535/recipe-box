# FINAL test: issue #4 recipe page (by-lines, delete + 10 s undo, print)

Run against the built app at http://127.0.0.1:3000 with the real API, Playwright Chromium, browser timezone
`America/Denver`. Script: `/tmp/claude-0/e2e4.py`. Screenshots: `shots/recipe-page/` (gitignored). All test recipes and
the `testedit` user were deleted at the end (live-recipe check: none left; soft-deleted rows remain in the trash).

## E2E table

| Step | Result | Evidence |
|---|---|---|
| "Added by" by-line | PASS | "Added by Smoke Test on Oct 21, 2026" |
| "Edited by testedit" after a PUT as `testedit` | PASS | "Edited by testedit on Oct 21, 2026" |
| `<time dateTime>` ISO + visible date in America/Denver | PASS | `2026-10-22T00:26:07Z` shows "Oct 21, 2026" (matches `Intl` in Denver; UTC would have said Oct 22) |
| No hydration warnings / console errors | PASS | console clean |
| Delete lands on `/` with `Deleted "<title>". Undo` | PASS | API confirms deleted |
| Undo within 10 s restores and opens the recipe | PASS | API 200 live, URL `/recipes/<id>` |
| Untouched toast disappears at about 10 s | PASS | 9.97 s and 10.00 s |
| Hover pauses the toast | PASS | still shown after 13 s hovered; then gone 9.9 to 10.0 s after leaving (timer resumed with its remainder) |
| Focus pauses the toast | PASS | still shown after 12.5 s with Undo focused |
| Two deletes within 10 s: two toasts, both undoable | PASS | 2 Undo buttons; both recipes live after Undo (client-side navigation between deletes; a full page reload clears toasts, expected) |
| Sign out with a toast showing, sign back in | PASS | no toast |
| Recipe already deleted in the background | PASS | "That recipe was already deleted.", no Undo |
| Restore answered 409 (route-fulfilled) | PASS | `Too late to undo: "Late Pie" can no longer be restored.`, no retry |
| Keyboard only: Tab to Delete, Enter; Tab to Undo, Enter | PASS | Delete reached in 9 tabs; recipe live again |
| Print: masthead, nav, actions, skip link hidden | PASS | none visible under print media |
| Print: ingredients (62 li) and numbered method (8 li) | PASS | `print-emulated-desktop.png`, `print-page1.png` |
| Print: link URL printed | PASS | "Example Kitchen (https://example.com/some/very/long/path/to/a/recipe?x=1)" |
| Print: toast hidden | PASS | status region not displayed |
| `print.pdf` written | PASS | `shots/recipe-page/print.pdf` |
| 390 px: 300-char title with spaces wraps | PASS | h1 16..374 of 390 |
| 390 px: 120-char ingredient word | PASS | wraps inside list |
| 390 px: 300-char title with two unbroken words (150 T, 149 W) | FAIL | see P1-1 |
| Touch targets >= 44 px (phone; sr-only skip link excluded) | PASS | none under 44 |
| No drop shadows on toast (light and dark viewed) | PASS | hairline only, matches UI.md |

## WARN lines
None for scroll-on-load or horizontal overflow (recipe page and home with 1 and 2 toasts, light and dark, 390 / 820 /
1180 / 1440). Note the unbroken-title case in P1-1 does not raise a page-level overflow because it is clipped, not scrolled.

## Problems (ranked)

No P0.

**P1-1 Unbroken long title overflows its box on both sides (clipped, unreadable) at 390 px, and in print.**
Symptom: with a title made of very long words (150 `T` then 149 `W`), the `h1` is 1024 px wide, left edge -317 px, so
letters are cut off at both sides; same at iPad and in `print-page1.png`. Titles with normal spaces are fine. Screenshots:
`recipe-phone-light.png`, `recipe-ipad-light.png`, `print-page1.png`. Likely file: the recipe page header / Heading in
`frontend/src/app/(app)/recipes/[id]/page.tsx` and `frontend/src/components/ui/Heading.tsx` (the `h1` sits in a flex
column; `overflow-wrap: break-word` does not shrink min-content there. Add `min-w-0` on the flex child and use
`overflow-wrap: anywhere`, or `break-words` plus `min-w-0`). Unlikely for real recipes, hence not P0.

**P2-1 Toasts cover list content on phones.** The two stacked toasts at 390 px overlap the first recipe titles at the
bottom of the viewport (`home-2toast-phone-light-viewport.png`). Expected for a fixed toast and the page has bottom
padding, so only mildly annoying. Likely file: `frontend/src/components/ui/Toast.tsx`.

**P2-2 Test note.** Undo restoring after the real 10-minute window is covered only by the route-fulfilled 409.
