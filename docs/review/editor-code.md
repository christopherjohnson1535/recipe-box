# Review R4: recipe editor (issue #3), UI + code

Scope: `git diff main...HEAD`. Checks run in `frontend/`: `vitest` 197 passed, `tsc --noEmit` clean, `npm run lint` clean.
Verdict: no Must. Round trip of all RecipeInput fields is sound (sections, blank lines, minutes, tags, imageId, sourceType,
photoImageIds). Four Should, six Nice.

## Checked and fine
- PUT full replace: `sourceType` and `photoImageIds` are carried from `initial` (RecipeForm.tsx:85-87); minutes are numbers or null;
  tags are normalised like `validate::tags`; blank rows dropped like `validate::lines`; dirty baseline is built from the same `buildInput`.
- Double submit: `saving` stays true after success until navigation, so no second POST.
- Error format: backend sends `{error:{code,message}}` with `"field: text"` for validation (validate.rs:92, 61), so the
  `^(\w+): (.+)$` mapping matches title, prepMinutes, cookMinutes, totalMinutes and sourceUrl. First `aria-invalid` gets focus.
- Reorder/remove buttons carry names with the item number ("Move ingredient 3 up"); focus follows the moved row and falls to the
  partner button at the ends; remove focuses a neighbour or the Add button; 44px targets via `size-11`/`min-h-control`.
- Only literal layout classes in pages and `recipe-form/**`; no rounded/shadow in new ui files (`rounded-control` is the token);
  all `--vars` used exist in `styles/components.css`.

## Should

**E-01 Should: unsaved-changes guard does nothing on the primary device.** RecipeForm.tsx:138-147. iOS Safari and installed PWAs
never show the `beforeunload` prompt, and client navigation (masthead links) is not intercepted, so on the iPad a half-typed
recipe is lost on any tap of the nav or a swipe-back. Case: type 20 ingredients on iPad, tap "Recipes". Smallest fix: also stash
the serialized state in `sessionStorage` on change (try/catch) and restore it on mount when the recipe id/new matches, or capture
`click` on in-app `<a>` while dirty and `confirm`. On desktop the current guard is acceptable; the plan's "skipped Link guard" is
only acceptable if the draft stash is added.

**E-02 Should: Enter in a section-heading input saves the form.** ListField.tsx:185-191. Ingredient rows trap Enter
(ListField.tsx:233) but the heading `Input` has no `onKeyDown`, so implicit submission saves and navigates away while the user
is typing "For the sauce". Smallest fix: same `onKeyDown` as the row input, moving focus to the row's text field.

**E-03 Should: an empty heading ("no section") looks like an unfilled heading, and removing it merges rows.** list-model.ts:12-19,
ListField.tsx:183-198. Items A,A,(none),(none) load as row 3 with `heading ""`, shown as an empty "Section heading" input. Clicking
its remove cross sets `heading=null`, so rows 3-4 silently join section A on save. Smallest fix: when `heading === ""` on a row
that follows a section, show a read-only "No section" rule with the same remove control relabelled "Join previous section", or
drop the ability to remove it; at minimum fix the label ("End section here").

**E-04 Should: out-of-range minutes produce raw serde text.** RecipeForm.tsx:69,105. `9999999999` becomes a JSON number that
axum rejects with `Failed to deserialize the JSON body ... prepMinutes: invalid value`, which fails the `^(\w+): ` match and is
shown whole in the top Alert. Decimals are silently rounded (`1.5` becomes 2). Smallest fix: `max={100000}` on the number
inputs plus a client check in `submit` that sets `errors.prep|cook|total` ("0 to 100000, whole minutes") before the request.

## Nice

**E-05 Nice: split-paste misses common cookbook bullets and section lines.** list-model.ts:34. `▢`, `☐`, `□`, `✓` are not in
`BULLET` (the cookbook checkbox `▢ 2 cups flour` keeps its glyph); a lone `\r` is not a line break; a pasted "For the sauce:"
line becomes an ingredient instead of a heading; hard-wrapped step text becomes one step per wrapped line. Fix: add the glyphs
to the class, split on `/\r\n|\r|\n/`, and turn a short line ending in `:` into a heading (ingredients only). Tests for CRLF and
`•` exist; add `▢`.

**E-06 Nice: paste with a caret in the middle of text inserts after the row, not at the caret.** ListField.tsx:161,
list-model.ts:56. Pasting two lines mid-text leaves the original row untouched and adds rows below. Acceptable; say so in the hint
or split the row at the caret.

**E-07 Nice: dead error-map entries and a `photo` key that cannot occur.** RecipeForm.tsx:99-100. The backend message is
`imageId/photoImageIds: unknown image.` (routes/recipes.rs:223), which contains a `/`, so `\w+` never matches and these entries are
unreachable; it falls to the top Alert, which is the right outcome. Delete the two entries.

**E-08 Nice: IME and repeated announcements.** ListField.tsx:233, 146-151. Enter during IME composition adds a row (check
`e.nativeEvent.isComposing`). The live note is not cleared, so two identical consecutive messages ("Ingredient 3 removed.") are
not re-announced; append a zero-width toggle or clear the note first.

**E-09 Nice: removing a tag drops focus to the body.** TagList.tsx:12, TagsField.tsx:287. Keyboard users lose their place;
focus `#rf-tags` after remove. Also each row exposes up to 4 tab stops (heading, up, down, remove): 25 ingredients means ~100
Tabs to cross the list. Optional Alt+Up/Alt+Down on the text field would fix it.

**E-10 Nice: ui nits.** `IconButton` hard-codes `size-11` (IconButton.tsx:27) where the token is `--control-height`; use `size-control`
(`--spacing-control` exists). `PhotoField` re-spells the secondary button look with `file:` utilities including arbitrary
`tracking-[0.12em]` (PhotoField.tsx:42), which will drift from `Button`; prefer an `sr-only` input driven by a `Button`
(label-for) so one definition styles it. `title` plus `aria-label` on IconButton makes some readers say the name twice.
`inputClass` exported from Input is fine.

## Reuse by #7 (import review)
Props are generic enough for the core: `initial` takes a RecipeDraft (`imageUrl`, `warnings`, `imageId`, `sourceType`,
`photoImageIds` all honoured), `onSubmit`/`cancelHref`/`submitLabel` are caller-owned. Gaps to expect, none blocking:
- `duplicateOf` is not rendered; #7 can put a banner above the form, so no change needed.
- Dirty baseline is the draft itself (RecipeForm.tsx:122), so an untouched draft (paid AI call) leaves with no warning; add a
  `startDirty?: boolean` prop or let #7 pass it.
- No `photoUrls`/side panel slot for the PHO-5 "photo plus empty form" case; add an optional `aside`/`children` slot then.
- A draft with `imageUrl` but no `imageId` shows a preview that is not saved (RecipeForm.tsx:64-65); ensure the API always sets both.

## Over-engineering (ponytail)
Mostly proportionate. The six small ui components each have one caller but follow the "all styling in ui" rule, so keep. `focusTick`
plus `alertRef` and the `FIELD_KEYS` table are the only machinery worth a second look (see E-07). No findings beyond that.

## Other notes (no action)
- PUT is last-write-wins; fine for one household. After save, `router.push` to the recipe page; going Back to the edit page may
  show the cached pre-save recipe in Next's router cache (unverified); `router.refresh()` before push would remove the doubt.
- Fields stay editable while saving; edits typed after pressing Save are dropped silently (the guard is off). Trivial.
