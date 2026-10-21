---
name: factory-requirements
description: Stage 1 of the software factory — turn a described workflow or feature idea into numbered, prioritised requirements the owner confirms. Use when a new project, feature or phase starts, or when the owner describes how they work today.
---

# Requirements

Goal: a short, numbered requirements document the owner can read in five minutes and say yes to.

## Steps

1. **Restate the current workflow** as numbered steps in the owner's words (e.g. "plug in card → copy to
   `D:\2026\Denver` → edit in Lightroom → export to Finished → sometimes border → sometimes upload").
   List the pain points each step implies. That list is where requirements come from.
2. **Look up anything external that could block a requirement** before writing it: third-party API rules,
   platform limits, licences. (Example: since 31 Mar 2025 the Google Photos Library API only lets an app add to
   albums it created — that changed GPH-3.) Cite the source in the doc.
3. **Write `docs/REQUIREMENTS.md`** with these sections:
   - Overview, goals (3–6 outcomes), non-goals (what stays in other tools).
   - Current workflow and pain points.
   - Functional requirements: one table per area, columns `ID | Requirement | Priority`. IDs are short prefixes
     per area (IMP-, BRW-, CUL-, BRD-, GPH-, SET-). Priority = Must / Should / Could. Each row is testable
     ("Skip files already imported (name + size + capture time) and say how many were skipped").
   - Non-functional requirements table: safety of originals, runs where, platform, performance numbers, formats,
     privacy, reliability, usability, maintainability.
   - Phased roadmap: phases that are each useful alone, with a "done when" sentence.
   - Open questions as a checklist (`- [ ]`), each answerable in one line.
4. **Ask the owner** only the open questions whose answer changes what gets built (AskUserQuestion, max 4).
   Default the rest and say which default you took.
5. If the owner keeps docs in Claude Docs, mirror the doc there; the repo copy is the one agents read.

## Rules
- Requirements describe outcomes, not implementation. Stack choices belong in the plan.
- Never cut: data safety (originals never modified), privacy of credentials, accessibility.
- Every later artifact (spec, reviews, fixes) references these IDs.
