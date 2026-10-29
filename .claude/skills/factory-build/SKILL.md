---
name: factory-build
description: Stage 3 of the software factory — build from docs/SPEC.md with a team of agents in waves (scaffold → design system → parallel features), or build one GitHub issue. Use after the plan is approved, or when adding a feature area to an existing build.
---

# Build with an agent team

You orchestrate; agents write the code. Agent model: Sonnet (the owner wants stage agents on a cheaper model) unless the owner says otherwise.
The rules below apply at every size.

## By size (see `factory`)
- **S:** one builder.
- **M:** one builder per tree, in parallel (disjoint owned paths).
- **L:** the waves below.

Builders run scoped checks only: `cargo clippy -p <crate> --all-targets -- -D warnings`, `cargo test -p <crate>`,
`npx vitest run <touched files>`, `npx tsc --noEmit`. Release builds belong to the tester. All builders in an issue
share one clone and one `backend/target/`.

## Waves

1. **Scaffold (done; see the example run in `docs/FACTORY.md`).** Backend and frontend skeletons, containers, CI.
2. **Design system (one agent, sequential).** Uses tastemaker (`.factory/vendor/tastemaker/skills/tastemaker/SKILL.md`,
   build mode) with the existing `.tastemaker/style-lock.md`; writes tokens, the app shell, `src/components/ui/*`,
   and `docs/UI.md`. Self-hosted fonts only. Runs every frontend check.
3. **Features (N agents in parallel, one per issue/area with disjoint owned paths).** Each brief:
   - "Read `docs/agents/agent-preamble.md` and follow it exactly."
   - The issue number, requirement IDs and spec section to follow.
   - "You own: <paths>" — copied from the issue's Owned paths.
   - Endpoints with method/body/response (from `docs/API.md`), the UI it must have (states: empty, loading, error,
     long content, offline), keyboard behaviour, and the test file it must add (the risky logic).
   - Cross-agent contract it provides or consumes ("uses `RecipeForm` from `src/components/recipe-form`; if it
     isn't there yet, that one type error is expected — mention it").
4. **Integration notes.** As reports arrive, collect: wiring someone must do in a file they don't own,
   duplicated helpers, contract mismatches between backend and frontend, README/wiki gaps. These become verify
   findings or new issues.

## After each agent reports
- Read the report, not the transcript. Note deviations and "needs X in file Y" items.
- Update the task list. Tell the owner in one line what landed.
- If an agent invented scope, note it for review rather than reverting yourself.

## Gotchas
- Parallel `npm run build` in one folder collides on `.next`; parallel `cargo build` contends on `target/` —
  one builder per tree per round. Parallel `git add -A` sweeps other agents' changes — own paths only.
- A new `"use client"` component without the directive can pass tsc but fail `npm run build`.
- `next/font/google` fails where fonts.googleapis.com is blocked — use fontsource packages.
- sqlx `query!` macros need a live DB at compile time — use runtime `query_as` with `FromRow`.
- Killing background servers with `pkill -f <pattern>` can kill your own shell if the pattern appears in the
  command line — kill by PID.
