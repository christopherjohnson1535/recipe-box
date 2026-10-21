# Plan for #3: Recipe editor (REC-1/2/3)

1. `components/recipe-form/list-model.ts`: pure rows model (text + optional section heading per row), add/remove/move
   (texts swap, headings stay in place), multi-line paste split (strips bullets/numbering), rows <-> `{text, section}`
   items, tag parsing. Vitest tests.
2. New ui files (all styling lives here): `Textarea`, `IconButton`, `Fieldset`, `ListEditor` (EditorList/EditorItem),
   `TagList`, `PhotoField`. `Input` exports `inputClass` so Textarea shares it. Only existing component tokens reused.
3. `RecipeForm` (client): generic props `initial` (RecipeInput | RecipeDraft | Recipe), `submitLabel`, `onSubmit`,
   `cancelHref`, optional `api`. Sub-parts `ListField` (ingredients/steps) and `TagsField`. Shows `warnings`.
4. Save keeps `sourceType` and `photoImageIds` from `initial` (PUT is a full replace). Errors: API message
   "field: text" is mapped to the field, else Alert on top; first error is focused.
5. Dirty = serialized input differs from initial: `beforeunload` plus confirm on Cancel; off after a successful save.
6. `RecipeEditor` (client) wires create/update + redirect; pages `/recipes/new` and `/recipes/[id]/edit`
   (server-side load, 404/ServerError like the recipe page).
7. Tests: list-model, form (paste split, submit round-trip with mocked api, field error). Docs: UI.md catalogue, wiki.
8. Skipped: drag reordering, client-side navigation (Link) guard for unsaved changes (only reload/close + Cancel).
