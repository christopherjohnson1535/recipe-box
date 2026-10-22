# Review R4 (UI + data safety): issue #4 recipe page

Checks run: `npx vitest run` (309 pass), `npx tsc --noEmit` (clean). Backend confirmed: `remove` is a soft delete,
`restore` works for 10 minutes (409 after), purge after a day.

## Must

**P-01 Must** `undo/UndoToast.tsx:15-21`, `undo-store.ts:19`. A second delete replaces the first offer.
Case: delete A (toast), within 10 s open B and delete it. `showUndo` overwrites `current`; A's Undo is gone with no
way back in the UI (A is only restorable by calling the API by hand). Fix: keep a small list in the store
(`offers: UndoOffer[]`, append, remove by seq), render one `UndoBody` per offer (stack, newest nearest the edge, cap
3). Add a test: two `showUndo` calls show two Undo buttons.

**P-02 Must** `recipe-page/byline.ts:3`. Dates are formatted in UTC. Owner is in America/Denver: an edit made after
6 pm MDT (5 pm MST) is stamped the next day (`2026-10-22T00:30Z` shows "Oct 22" for an Oct 21 evening). The tests
only use daytime UTC instants so they cannot catch it. Smallest fix: keep `byline.ts` pure but have it return
`{ verb, who, iso }[]`; render the date in a tiny client component `LocalDate` that formats with
`Intl.DateTimeFormat("en",{dateStyle:"medium"})` (no `timeZone`) via
`useSyncExternalStore(noop, () => fmt(iso), () => "")` (server snapshot empty, so no hydration mismatch; the line
reads "Added by Chris" for one frame, then gains " on Oct 21, 2026"). Add a test with `TZ=America/Denver` and
`2026-10-22T00:30:00Z` expecting "Oct 21". (Alternative with no client code: drop the date and show only names.)

## Should

**P-03 Should** `undo-store.ts:8-10`, `AppHeader.tsx:20-25`. The offer is never cleared except by the timer inside
the mounted `UndoBody`. Case: delete a recipe, sign out within 10 s: `/login` is outside the `(app)` layout, so
the toast unmounts but `current` stays; the next person who signs in on that device (client navigation) gets
"Deleted "Soup". Undo" with a fresh 10 s, for a recipe they did not delete. Same if you leave `(app)` and come back.
Fix: `dismissUndo()` in `signOut()` and in a cleanup effect in `UndoToast` (unmount of the layout). Test: offer
survives remount today, should not.

**P-04 Should** `DeleteRecipeButton.tsx:28-33`. Failure copy is wrong for 404. Case: delete in tab 1, press Back or use
tab 2 on the same recipe page, Delete: API returns 404, UI says "Not deleted. The recipe is still in your box."
Fix: treat `ApiError` 404 as success without a toast (go home); keep the Alert for other errors. Add a test.

**P-05 Should** `docs/wiki/Adding-and-Editing-Recipes.md`, toast copy. Undo window is 10 s in the UI but 10 minutes
in the backend, and nothing tells the user. A reload, closing the tab, or a missed toast leaves no way back. Smallest
honest fix: no new UI; say in the wiki (and REC-2 note) that the toast is the only undo in the app, and that
an administrator can restore for 10 minutes via the API. Optional (Nice): persist `{id,title,deletedAt}` in
`sessionStorage` and re-show the toast after a reload with the remaining time.

**P-06 Should** `ui/Toast.tsx:21`. `shadow-lg` breaks `docs/UI.md:153` ("no drop shadows"). Use a hairline border
(`border border-(--toast-fg)/20`) or nothing; the inverse fill already separates it.

**P-07 Should** `docs/REQUIREMENTS.md:41` (REC-2) says "delete asks to confirm". The build deletes at once. The issue
text and plan accept this, but the requirement and the PR should say so explicitly (and note the double safety is
now only the toast), or the requirement should be edited to "delete is undoable for 10 s".

## Nice

**P-08 Nice** `UndoToast.tsx:50-60`. No Escape to dismiss. Focus is not moved (good) but after delete the page changes
and focus resets to the body: Undo is the last tab stop (Shift+Tab from the top reaches it in one press). Add one
line to UI.md so it stays that way; add `onKeyDown` Escape on the Toast if wanted.

**P-09 Nice** `UndoToast.tsx:22-31`. Timer effect reads `remaining.current` of 0 or negative after long hover; works
(setTimeout 0) but a 1-line `Math.max(0, ...)` makes intent clear.

**P-10 Nice** `DeleteRecipeButton.test.tsx`. No test that a second click while pending does not call the API twice
(the Button is `disabled` so it holds; pin it). `UndoToast.test.tsx` does cover timeout, hover/focus pause, 409, retry
and dismiss; these would fail if pause or 409 handling broke.

**P-11 Nice** `globals.css:173-208`. Print block placement is right (after the theme imports, so it wins in dark
mode). `main a[href^="http"]::after` only prints absolute links (source), internal links are not expanded; content is
kept, chrome hidden. Fine. Consider `@page { margin: 1.5cm }`.

## Checked, no finding
Server safety: `showUndo` is only called from click handlers, the server snapshot is `null`, so no shared module state
on the server. Client navigation keeps the store (intended). Undo racing navigation: restore then `push`, busy pauses
the timer, 409 not retryable. Home list staleness: home and recipe pages are dynamic, no `staleTimes` override, so push
refetches. Toast a11y: polite live region stays mounted, 44 px actions, `min-w-0` + `line-clamp-2`, reduced-motion has
no animation, bottom space `pb-20` clears the toast at 390 px. Tokens and contrast pairs are in `tokens.test.ts`.
