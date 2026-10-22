# 0005. Imports return drafts; nothing is saved until the user reviews and saves

Status: Accepted · Date: 2026-10-22 (recorded after the fact; the decision predates this record)

## Context
Importing from a link, a photo or pasted text is imperfect, especially with OCR and AI: quantities, steps and titles can be wrong, and the same recipe may already exist. Silently saving would fill the box with bad data.

## Decision
The import endpoints return a `RecipeDraft` (recipe fields plus `warnings`, `duplicateOf`, and the already-stored image ids) and write no recipe. The client shows the draft in the editor, and only the user's explicit save posts it to `POST /api/recipes`. Duplicates are flagged in the draft, not blocked.

## Consequences
- Bad extractions cost the user a correction, not a cleanup of saved data.
- Uploaded photos are stored when an import runs, so an abandoned draft can leave an unused image behind (check the purge job in `backend/src/lib.rs` before relying on cleanup).
- The import UI is a review flow (link, photo or text, then review, then save), not a one-click action.
