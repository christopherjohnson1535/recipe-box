# Plan for #4: Recipe page (REC-1/2, ACC-4)

1. `components/recipe-page/byline.ts` (pure): "Added by X on <date>" / "Edited by Y on <date>" via Intl.DateTimeFormat;
   Edited shows when the editor differs or updatedAt is >1 min after createdAt. Vitest tests.
2. `recipe-page/DeleteRecipeButton` (client): ghost Delete -> api.deleteRecipe -> showUndo -> router.push("/"); error -> Alert.
3. `components/undo/undo-store.ts` (module store, useSyncExternalStore; survives client navigation) + `UndoToast`
   (10 s countdown, pauses on hover/focus, Undo -> restoreRecipe -> /recipes/:id, 409 and other errors said in the toast, dismiss).
   Mounted once in `(app)/layout.tsx`.
4. `ui/Toast.tsx` (ToastRegion live region, Toast, ToastAction, ToastDismiss) + toast tokens in components.css and
   contrast pairs in tokens.test.ts.
5. Overflow: `[overflow-wrap:anywhere]` on ingredient/step/byline text. Print: `print:hidden` on masthead, skip link,
   page actions, toast; `@media print` block in globals.css (ink on white, no break inside steps, source URL printed).
6. Docs: UI.md, wiki (delete + undo, printing). Tests for store/toast, delete button, byline.
