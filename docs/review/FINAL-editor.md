# FINAL test: recipe editor (#3)

Run against the built app at http://127.0.0.1:3000 and the real API (Playwright, keyboard-first; script
`/tmp/claude-0/e2e.py`, `/tmp/claude-0/shots.py`). Screenshots: `shots/editor/` (gitignored, 31 files).

## E2E

| Step | Result | Evidence |
|---|---|---|
| a1 fill title, description, servings, minutes, source, notes; tags via Enter and comma | PASS | tags "Dinner", "Quick Fix", duplicate "dinner", "Vegetarian" saved as `dinner, quick fix, vegetarian` (lower-cased, deduped) |
| a2 paste `1. 2 eggs / - 100 g flour / • pinch salt / blank / ▢ milk` | PASS | 4 rows: `2 eggs`, `100 g flour`, `pinch salt`, `milk` |
| a3 section heading via keyboard; Enter in heading | PASS | focus moves to the row text, URL unchanged (not saved) |
| a4/a5 move up (Enter), move down (Tab + Space) | PASS | order swaps and restores; focus follows the moved row; headings stay in place |
| a6 add via Add button (Enter), type, remove | PASS | 5 rows then 4; focus lands on a neighbour row |
| a7 steps: add, section heading, move up x2 | PASS | `Cool and slice / Make the dough / Bake it`, heading "Finishing" on step 2 |
| a8 photo upload | PASS | POST /api/media, preview shown |
| a9 save (Enter on Save recipe) | PASS | redirected to /recipes/<id> |
| a10 `GET /api/recipes/<id>` round trip | PASS | title, description (with newline), servings "6", 15/40/55, tags normalised, notes, source url and name, imageId, ingredients and steps with sections and order exactly as entered |
| b0 edit page prefilled | PASS | all values and rows present |
| b1 edit: title, servings, clear prep, total 60, clear notes, remove ingredient, move, remove a section heading, move step, remove a tag, add a tag; save; API | PASS | steps lose the "Finishing" section; tags `dinner, vegetarian, weeknight`; prepMinutes null; imageId kept; notes saved as `""` (not null, harmless) |
| c1 empty title | PASS | `#rf-title` focused, aria-invalid, "Give the recipe a title.", no request |
| c2 minutes 2.5 and 99999 | PASS | both fields flagged "Whole minutes, 0 to 10,000.", first focused, no request sent |
| c3 non-image upload | PASS | "That file is not an image we can read (JPEG, PNG, WebP or GIF)." |
| d1 navigate away via masthead and return | PASS | "You have unsaved changes from earlier" Alert with Restore / Discard |
| d2 Restore | PASS | title and ingredient back, Alert gone |
| d3 Discard | PASS | Alert gone, form empty, still gone after reload |
| d4 Cancel with changes | PASS | confirm "Discard your changes?"; dismiss stays, accept leaves; no stash Alert afterwards (d5) |
| d6 Cancel on pristine form | PASS | no confirm |
| e1 edit page for missing id | PASS | HTTP 404, "Page not found" with Back to recipes |

Test recipes created by the run were deleted through the API.

## WARN lines

None. No page was scrolled on load and nothing overflowed horizontally (390 / 820 / 1180 / 1440, light and dark,
new and edit). No control under 44 px at 390 px (checked buttons, inputs, links).

## Visual review (docs/UI.md)

Looked at: light iPad (empty, filled, edit, errors, restore alert), light phone (empty, filled, edit), dark desktop
edit. Editorial look holds: uppercase tracked labels, italic hints, square controls, hairlines, no rounded or
shadowed widgets, numerals in accent, section headings with a left rule. Focus ring (2px accent-red outline) is
clearly visible on the focused reorder button (`light-new-filled-ipad.png`, also `light-focus-reorder-ipad-viewport.png`).
Field errors are red with a red border, restore Alert is a margin note with a left rule. Nothing clipped except P2-2.
(The red "Choose file" button in `light-errors-ipad.png` is the mouse hover after the page scrolled, not an error state.)

## Problems (ranked)

No P0, no P1.

- P2-1 "No file chosen" is shown next to the native file button while a photo is already attached
  (`light-edit-ipad.png`, `light-new-filled-phone.png`); the native file input text is misleading and the native
  button is not tokenised. Fix: `frontend/src/components/ui/PhotoField.tsx` (hide input behind a label button, show the filename or nothing).
- P2-2 Single-line title input clips a long title on the phone with no wrap (`light-edit-phone.png`: "...with charred").
  Cosmetic; the full value is there. Fix: use a one-row auto-growing textarea for Title, `RecipeForm.tsx` / `ui/Textarea.tsx`.
- P2-3 Disabled up/down buttons (first up, last down) are very pale next to enabled ones and read as missing
  (`dark-edit-desktop.png`, `light-edit-ipad.png`); expected for disabled, but contrast is low. Fix: `ui/IconButton.tsx` disabled colour.
- P2-4 Form column stays at the 38rem measure while the page head spans the full width, leaving the right half of the
  page empty at 1180 and 1440 (`dark-edit-desktop.png`). Deliberate per plan; consider a two-column layout later.
  Fix: `app/recipes/new/page.tsx` and `edit/page.tsx` layout.
- P2-5 Cleared notes are saved as `""` rather than null (API round trip). Harmless; `RecipeForm.tsx` buildInput could send null.
- P2-6 Section headings stay in place when rows move (by design); a user moving the first row of a section will see its
  text leave the section. Behaviour matches the plan; worth a hint line in the wiki.
