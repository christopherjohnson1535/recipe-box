# Agents

All coding agents (Claude, Codex, Copilot…) start with [`CLAUDE.md`](CLAUDE.md) — it holds the full project context
and the workflow for picking up a GitHub issue. Builder rules: [`docs/agents/agent-preamble.md`](docs/agents/agent-preamble.md).
The build process is the software factory: [`docs/FACTORY.md`](docs/FACTORY.md) and `.claude/skills/factory*/`.

One command runs the local checks: `just check` (lint, format, types, tests, audits; coverage and scans are CI-only) (see the checks table in `CLAUDE.md`; `just` lists all recipes).

Backend layer rules (where new Rust code goes, and what each crate may depend on): "Where new backend code goes" in [`CLAUDE.md`](CLAUDE.md).
