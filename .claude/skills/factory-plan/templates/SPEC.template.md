# <Project> — build spec for the agent team

Source of truth for requirements: `docs/REQUIREMENTS.md` (IDs like IMP-1 refer to it).
This file is the plan. Agents do not change it; if something here is wrong, say so in your report.

## What it is
<Three sentences: who uses it, where it runs, what it does. What must stay possible later (Vercel, Docker).>

## How we write code
- Ponytail rules: smallest complete change, no speculative options, no new dependency for a few lines, one
  small test for non-trivial logic, `// shortcut: <limit>, <when to upgrade>` for known limits.
  Never cut: input/path validation, data-loss safety, security, accessibility.
- UI: tastemaker rules + the design system (`docs/UI.md`, `docs/THEMING.md`). Pages use `src/components/ui` only.
- TypeScript strict. <Framework conventions, e.g. Next.js App Router, async params, route handlers.>
- Platform: <e.g. Windows first — path.join/resolve only; must also run on Linux for tests>.
- <Data-safety invariant, e.g. imports never half-save a recipe; deletes are soft and restorable.>
- <Validation invariant, e.g. every route taking a path calls assertAllowedPath() first.>

## Dependencies (allowed list)
<list>. Anything else needs a one-line reason in the agent's report.

## Data on disk
<files, JSON shapes, env overrides>

## Folder model
<directory layout and naming rules>

## Pages
| Route | Owner | Content |
|---|---|---|

## File ownership (only edit files you own; read anything)
- **Scaffold**: <configs, core lib files + tests, shared API routes>
- **Design**: <design tokens, layout, ui components, placeholder pages>
- **F1 <area>**: <paths>
- **F2 <area>**: <paths>

## Cross-agent contracts
<exact exported signatures one agent provides to another>

## Feature notes
<per area: algorithms, keys, limits, edge cases, external API constraints>

## Definition of done
`npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass. README covers setup and caveats.
