# Plan: issue #7 import screen (LNK-1/4/5, PHO-1/5)

1. `components/import/import-errors.ts`: pure `explainImportError(err, mode)` -> title, message, tone, offers
   (paste text / type it in), field-error flag, `photoIds` (PHO-5). Vitest table for every API.md code.
2. New ui: `Tabs` (tablist, arrow keys), `PhotoPicker` + `PhotoGallery`, `ChoiceGroup` (radios), `Pending`
   (status note + bar, one new token `--progress-fg` with a 3:1 pair). `Heading` gets `tabIndex`/`ref` so the
   review heading can take focus.
3. `RecipeForm` (additive): `startDirty` (an untouched paid draft still warns on leave) and `draftKey={null}` turns
   the sessionStorage stash off. Imports use null: a reload loses the draft anyway, so a stash would only offer a
   stale one over a new import.
4. `components/import/ImportScreen.tsx` (+ `ImportPanels.tsx`): state machine idle -> pending -> review | problem.
   Mode lives in the URL via `history.replaceState` (no remount); `?url=` pre-fills and starts the link import once.
   Cancel = stop waiting (request id guard; fetch has no abort in api.ts). Review: focus heading, warnings,
   duplicateOf Alert with Import anyway, photos beside the form (original photos or PHO-5 empty form).
5. Page reads `searchParams` (Promise) and passes mode/url. Tests: errors table, flow with mocked api.
6. Docs: UI.md, wiki Importing-Recipes. Checks: lint, tsc, vitest, build.
