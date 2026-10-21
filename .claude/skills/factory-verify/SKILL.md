---
name: factory-verify
description: Stage 4 of the software factory — independent review agents (code quality, UI, standards, integration) write findings files, then fix agents partitioned by file ownership fix them in waves with a FIXES.md ledger. Use after a build wave, after a large change, or when asked for a code quality check.
---

# Verify: review agents, then fix agents

## Round 1 — reviewers (parallel, read-only)
Split by area so no two reviewers read the same code for the same purpose. Each brief: "Read
`<review-preamble>` and follow it", scope (paths), focus list, slug.

| Reviewer | Method | Typical focus |
|---|---|---|
| R1 core + import + library | ponytail-review | path traversal, Windows paths, data never lost mid-copy, dedupe index crash-safety, cache growth |
| R2 domain features (cull, border) | ponytail-review | moves never overwrite, sidecar edits keep foreign data, grouping perf at 1,000+ items, key consistency with other features |
| R3 integrations (Google, settings) | ponytail-review + vendor docs via WebFetch | OAuth state, request shapes vs docs, partial-failure records, no duplicate side effects, no retry of non-idempotent calls |
| R4 UI | tastemaker audit verb | style-lock consistency, states, focus, aria, copy voice, wiring (e.g. sidebar data) |
| R5 integration | build + smoke | runs tsc/lint/vitest/build; boots the app on fixture data; hits every route incl. traversal attempts; cross-feature consistency |
| V1/V2 standards (UI rounds) | `docs/standards/vercel-web-interface-guidelines.md` | interactions + forms / layout, content, design, perf — pass/fail per item |

Only R5 builds. Every finding: ID, Must/Should/Nice, file:line, failing case, smallest fix.

## Round 2 — fixers (waves partitioned by ownership)
- **Wave A (parallel, disjoint owners):** core/import/library (R1 + integration items in those files),
  domain features (R2), integrations (R3). Each brief: "Read `<fix-preamble>`", the findings files, "You own: …",
  guidance for the tricky Musts (e.g. "copy to `<name>.partial`, verify size, rename; never delete a verified
  copy because the index write failed").
- **Wave B (after A):** UI fixes (R4/V*) owning `src/app/**/page.tsx`, `src/components/**`; shared-code dedupe
  owning `src/lib/**`, `src/app/api/**` with the hard rule "API response shapes and status codes unchanged".
  Name one of them as the round's builder.
- Route cross-owner items: if a fixer is still running, `SendMessage` it the extra item; otherwise queue it.
- Ledger: every finding ends as one line in `docs/review/FIXES.md` (fixed — how / skipped — why).

## Gate
All Musts fixed; Shoulds fixed or skipped with a reason the owner would accept; full checks pass. Then
`factory-test`.
