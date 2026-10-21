---
name: factory-verify
description: Stage 4 of the software factory — independent review agents (security, code quality, UI, standards, integration) write findings files, then fix agents partitioned by file ownership fix them in waves with a FIXES.md ledger. Use after a build wave, after a large change, or when asked for a code quality check.
---

# Verify: review agents, then fix agents

## Round 1 — reviewers (parallel, read-only)
Split by area so no two reviewers read the same code for the same purpose. Each brief: "Read
`.claude/skills/factory-plan/templates/review-preamble.md` and follow it", scope (paths), focus list, slug.

| Reviewer | Method | Typical focus |
|---|---|---|
| R1 backend core | ponytail-review | auth and sessions (cookie flags, expiry, constant-time checks), admin checks, validation, SQL, soft delete/restore, error shapes vs `docs/API.md` |
| R2 imports and media | ponytail-review | SSRF (private IPs, redirects, DNS rebinding), size/time limits, image decoding safety, JSON-LD edge cases, no half-saved recipes |
| R3 integrations | ponytail-review + vendor docs via WebFetch | AI provider request shapes, key handling, timeouts/retries, no retry of non-idempotent calls, behaviour with AI off |
| R4 UI | tastemaker audit verb + `docs/UI.md` | editorial style consistency, states, focus, aria, copy voice, iPad touch targets, offline banners |
| R5 integration | build + smoke | runs every check; boots the stack (compose or native) on seed data; hits every route incl. SSRF and auth-bypass attempts; frontend ↔ API contract consistency |
| V1/V2 standards (UI rounds) | `docs/standards/vercel-web-interface-guidelines.md` | interactions + forms / layout, content, design, perf — pass/fail per item |

Only R5 builds. Every finding: ID, Must/Should/Nice, file:line, failing case, smallest fix.

## Round 2 — fixers (waves partitioned by ownership)
- **Wave A (parallel, disjoint owners):** backend core (R1), imports/media (R2), integrations (R3). Each brief:
  "Read `.claude/skills/factory-plan/templates/fix-preamble.md`", the findings files, "You own: …", guidance for the
  tricky Musts (e.g. "resolve once, connect to the resolved IP, re-check after every redirect").
- **Wave B (after A):** UI fixes (R4/V*) owning `frontend/src/app/**`, `frontend/src/components/**`; shared-code
  dedupe with the hard rule "API response shapes and status codes unchanged". Name one builder per tree.
- Route cross-owner items: if a fixer is still running, `SendMessage` it the extra item; otherwise queue it.
- Ledger: every finding ends as one line in `docs/review/FIXES.md` (fixed — how / skipped — why).

## Gate
All Musts fixed; Shoulds fixed or skipped with a reason the owner would accept; full checks pass. Then
`factory-test`.
