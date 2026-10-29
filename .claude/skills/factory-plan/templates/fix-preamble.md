# Rules for every fix agent

First read the builder preamble (`agent-preamble.md`) and follow it — except that file ownership is replaced by the
"You own" list in your brief.

- Findings are in `<SCRATCH_DIR>/*.md` (working notes outside the repo; never `git add` them). Read the ones named in your brief in full, plus the code they cite.
- Fix every Must and Should assigned to you. Nice only when it deletes code or is a one-liner.
- Re-read the cited lines and confirm the failing case first. If a finding is wrong, skip it and say why.
- Smallest fix that works. Every data-safety fix (save, delete/restore, import, backup/restore) gets a test
  that fails without the fix.
- After fixing: your paths clean in tsc and eslint; your tests pass (`npx vitest run <touched files>`; the tester runs the full suite and release builds).
- Commit per finding group ("Fix R1-01: copy to temp name then rename"). Append one line per finding to
  `<SCRATCH_DIR>/FIXES.md`: `R1-01 fixed — <how>` or `R1-07 skipped — <why>` (append with `>>`).
- Report (under 150 words): fixed/skipped counts, anything needing the owner's decision or another owner's file.
