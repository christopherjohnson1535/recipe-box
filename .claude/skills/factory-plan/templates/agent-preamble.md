# Rules for every builder agent

## Where things are
- Code: `<CODE_DIR>`. Reach it with `<SHELL_TOOL>` (local Bash, or `mcp__remote-devices__device_bash` when the
  code lives on the owner's machine — each call is a fresh shell: always `cd <CODE_DIR> && …`, max 180 s).
- On a remote device: write files with quoted heredocs (`cat > f <<'EOF'`), small edits with python3. Never
  retype a file from truncated output.

## Read first
- `docs/SPEC.md` (plan + file ownership), `docs/UI.md`, `docs/THEMING.md` (if UI), `.tastemaker/style-lock.md`.
- Existing `src/lib/*` and `src/components/ui/index.ts` — reuse them; never duplicate a helper.

## Skills (read with your Read tool)
- Ponytail coding rules: `<SKILLS_DIR>/ponytail/skills/ponytail/SKILL.md` — follow them.
- UI quality: `<SKILLS_DIR>/tastemaker/skills/tastemaker/references/interface-quality-rules.md` and
  `anti-slop-checklist.md`. Use only tokens/components from the design system.

## Working alongside other agents in the same folder
- Edit ONLY files you own per SPEC.md. If you need a change elsewhere, work around it and put it in your report.
- Do NOT run `npm install` or `next dev` unless your brief names you as this round's builder.
- Check with scoped commands: `npx tsc --noEmit 2>&1 | grep -E '<your paths>'`, `npx eslint <your paths>`,
  `npx vitest run <your tests>`. Release builds and the full test run belong to the tester.
- Commit only your paths: `git add <your paths> && git commit -m "<msg>"`. If `index.lock` exists, wait 5 s and
  retry (max 5). Never `git add -A`, never reset/checkout/stash.
- Commit message: a subject line (imperative, under 72 characters, says what changes, e.g. `fix(backend): re-check redirects in safe_fetch`), then a blank line and a short body of 1-3 lines on what and why. No bullet lists or run summaries; longer detail goes in the PR description.
- Framework gotchas: <e.g. Next.js 16 params are Promises; "use client" on hook files; no runtime export with
  cacheComponents>.

## Report (under 200 words)
Files created, API shapes (method + body + response), test results, what you skipped (ponytail style), anything
needed in files you don't own.
