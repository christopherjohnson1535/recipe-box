---
name: factory-plan
description: Stage 2 of the software factory — turn confirmed requirements into docs/SPEC.md with stack, data model, pages, file ownership and agent preambles so a team of agents can build in parallel. Use after requirements are confirmed, or before any multi-agent build.
---

# Plan

Goal: a spec precise enough that five agents can build at once without touching each other's files.

## 0. Environment check (do this first)
- Where will agents run? Check in that place: `npm view next version`, a throwaway `npm install`, `git` access.
  If the registry is blocked, stop and ask the owner to allow it (claude.ai → Settings → Capabilities) or to
  run the build on their machine. Fonts from Google Fonts can be blocked at build time → self-host via
  `@fontsource-variable/*`.
- Note the owner's OS (Windows paths, `D:\`), where they'll run the app, and whether Docker/Vercel matter.

## 1. Write `docs/SPEC.md` from `templates/SPEC.template.md`
Must contain:
- **What it is** in three sentences, where it runs, and what must keep working on Vercel/Docker later.
- **How we write code:** ponytail rules (smallest complete change, one test per non-trivial logic,
  `// shortcut: <limit>, <when to upgrade>` comments), UI rules (tastemaker + design system), path validation,
  "originals are never modified".
- **Allowed dependencies** list. Anything else needs a one-line reason in the agent's report.
- **Data on disk** (files, JSON shapes) and the **folder model**.
- **Pages table:** route · owner agent · content.
- **File ownership table:** every path that will exist, owned by exactly one agent (scaffold, design, F1…Fn).
- **Cross-agent contracts:** exact exported signatures one agent provides to another
  (e.g. `UploadPanel(props: { year; name; files: string[] })`).
- **Feature notes:** the algorithm/edge-case decisions per area (dedupe key, grouping rule, retry rules).
- **Definition of done:** `tsc`, `lint`, `vitest`, `build` pass; README covers setup.

## 2. UI architecture (when there is UI)
- Three token layers: theme primitives → semantic tokens → component tokens. Only `src/components/ui/*` reads
  component tokens; pages compose ui components + layout utilities only. See `docs/THEMING.md`.
- Guard tests: theme contract (every theme defines every token, contrast ≥ 4.5:1), themes-are-distinct,
  no-page-styling. Adding a theme = one CSS file + one registry entry.

## 3. Agent preambles
Copy `templates/agent-preamble.md`, `templates/review-preamble.md`, `templates/fix-preamble.md` to a scratch
location the agents can read (or reference them in-repo). Fill in: where the code lives, how to reach it
(local shell vs remote device tool), skill file paths, who may build this round.

## 4. Show the owner
One message: stack, the order of agent waves, anything that needs their action (allow a domain, connect GitHub).
Then start `factory-build`.

## Templates
- `templates/SPEC.template.md` — skeleton with every section above.
- `templates/agent-preamble.md` — rules for builders (ownership, no parallel builds, scoped checks, commits).
- `templates/review-preamble.md` — rules for reviewers (read-only, findings format, concrete failing case).
- `templates/fix-preamble.md` — rules for fixers (confirm then fix, test for data-safety fixes, FIXES.md ledger).
