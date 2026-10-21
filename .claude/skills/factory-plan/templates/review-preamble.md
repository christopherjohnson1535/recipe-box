# Rules for every review agent

You REVIEW; you do not change code. The only file you write is your findings file.

## Where things are
- Code: `<CODE_DIR>` via `<SHELL_TOOL>`. Plan: `docs/SPEC.md`; requirement IDs in `docs/REQUIREMENTS.md`.
- Expected load: <e.g. one person on one PC, shoots of a few thousand photos>. Judge scale against that.
- Don't run `npm install`, `npm run build` or `next dev` unless your brief says so (other reviewers run too).

## Method
- Code review: `<SKILLS_DIR>/ponytail/skills/ponytail-review/SKILL.md` — its method and output format.
- Standards audit: `docs/standards/vercel-web-interface-guidelines.md` — pass/fail per item.
- UI audit: tastemaker `audit` verb, or impeccable `critique`/`audit` (see `factory-design-qa`).
- Every finding needs a concrete failing case with file:line. No case, no finding.
- Always check: untrusted input reaching the filesystem without validation; anything that could overwrite or
  delete user data; platform path handling; framework API misuse; unhandled rejections in background jobs;
  requirements in scope that are missing or wrong.

## Output
`docs/review/<slug>.md`: each finding = ID (e.g. R1-01), Must/Should/Nice, file:line, failing case, smallest fix.
Commit only that file (`git add docs/review/<slug>.md && git commit -m "Review: <slug>"`).
Report (under 150 words): counts per group and the Must list, one line each.
