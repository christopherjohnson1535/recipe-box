---
name: factory-requirements
description: Stage 1 of the software factory — turn a described workflow or feature idea into numbered, prioritised requirements the owner confirms. Use when a new project, feature or phase starts, or when the owner describes how they work today.
---

# Requirements

Goal: a short, numbered requirements document the owner can read in five minutes and say yes to.

## By size (see `factory`)
This stage runs per project or phase, not per issue; issues cite existing requirement IDs (all sizes).

## Steps

1. **Restate the current workflow** as numbered steps in the owner's words (e.g. "find a recipe on a blog →
   bookmark it → open it on the iPad while cooking → screen locks → scroll past ads again").
   List the pain points each step implies. That list is where requirements come from.
2. **Look up anything external that could block a requirement** before writing it: third-party API rules,
   platform limits, licences. (Example: iOS has no web Share Target, so "save from the share sheet" became an
   Apple Shortcut — LNK-6.) Cite the source in the doc.
3. **Write or extend `docs/REQUIREMENTS.md`** with these sections:
   - Overview, goals (3–6 outcomes), non-goals (what stays out of scope).
   - Current workflow and pain points.
   - Functional requirements: one table per area, columns `ID | Requirement | Priority`. IDs are short prefixes
     per area (REC-, FND-, LNK-, PHO-, KIT-, ACC-, OPS-). Priority = Must / Should / Could. Each row is testable
     ("Warn when the same source URL was already saved and link to it").
   - Non-functional requirements table: data safety, privacy/security, network safety, platforms, performance
     numbers, accessibility, reliability, portability, maintainability.
   - Phased roadmap: phases that are each useful alone, with a "done when" sentence.
   - Open questions as a checklist (`- [ ]`), each answerable in one line.
4. **Ask the owner** only the open questions whose answer changes what gets built (AskUserQuestion, max 4).
   Default the rest and say which default you took.
5. **Turn new requirements into issues:** add entries to `scripts/github/backlog.py` and run
   `python3 scripts/github/sync_backlog.py <owner/repo>`.

## Rules
- Requirements describe outcomes, not implementation. Stack choices belong in the plan.
- Never cut: data safety (no half-saved recipes, restorable backups), privacy of credentials, accessibility.
- Every later artifact (spec, issues, reviews, fixes) references these IDs.
