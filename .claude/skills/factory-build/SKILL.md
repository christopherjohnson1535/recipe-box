---
name: factory-build
description: Stage 3 of the software factory — build from docs/SPEC.md with a team of agents in waves (scaffold → design system → parallel features). Use after the plan is approved, or when adding a feature area to an existing build.
---

# Build with an agent team

You orchestrate; agents write the code. Default agent model: whatever the owner asked for (here: Haiku).

## Waves

1. **Scaffold (one agent, sequential).** Framework app, allowed deps, core libs from the spec with tests
   (settings, path validation, file helpers, metadata, job registry), shared API routes, README skeleton, git
   init with local user config. Runs every check including `npm run build`. Report = exact exported signatures.
2. **Design system (one agent, sequential).** Uses tastemaker (`skills/tastemaker/SKILL.md`, build mode) for a
   cold start or the existing style lock; writes tokens, layout/app shell, `src/components/ui/*`, placeholder
   pages for every route, `docs/UI.md`. Self-hosted fonts only. Runs every check.
3. **Features (N agents in parallel, one per area in the ownership table).** Each brief:
   - "Read `<agent-preamble>` and follow it exactly."
   - The requirement IDs it builds and the spec section to follow.
   - "You own: <paths>" — copied from the ownership table.
   - Endpoints with method/body/response, the UI it must have (states: empty, loading, error, long content),
     keyboard behaviour, and the one test file it must add (the risky logic, with temp dirs).
   - Cross-agent contract it provides or consumes ("import X from Y; if it isn't there yet, that one type error
     is expected — mention it").
   No feature agent installs or builds.
4. **Integration notes.** As reports arrive, collect: wiring someone must do in a file they don't own,
   duplicated helpers, key-format mismatches between features, README gaps. These become verify findings.

## After each agent reports
- Read the report, not the transcript. Note deviations and "needs X in file Y" items.
- Update the task list. Tell the owner in one line what landed.
- If an agent invented scope, note it for review rather than reverting yourself.

## Gotchas this project hit
- Parallel `npm run build` in one folder collides on `.next`; parallel `git add -A` sweeps other agents' staged
  changes — hence "own paths only".
- A brand-new `"use client"` hook file without the directive passes tsc but fails the build — the round's
  builder must run `npm run build`.
- `next/font/google` fails where fonts.googleapis.com is blocked — use fontsource packages.
