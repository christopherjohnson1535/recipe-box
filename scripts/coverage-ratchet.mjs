// Coverage ratchet. Usage: node scripts/coverage-ratchet.mjs [--update]
// Reads frontend/coverage/coverage-summary.json (vitest) and backend/coverage-summary.json (cargo llvm-cov --json
// --summary-only), compares with coverage-baseline.json, prints a markdown table, fails if a number drops > 0.1.
//
// How to raise the baseline: after a change that improves coverage, run both coverage commands (see the `coverage`
// job in .github/workflows/ci.yml), then `node scripts/coverage-ratchet.mjs --update`, and commit
// coverage-baseline.json. --update rewrites EVERY metric at once, so it can also lower one: review the diff and only
// commit increases. Lowering on purpose means editing coverage-baseline.json by hand, explained in the PR.
// A null baseline value means "report only".
import { readFileSync, writeFileSync } from "node:fs";

const TOLERANCE = 0.1;
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const round = (n) => Math.round(n * 100) / 100;

const fe = read("frontend/coverage/coverage-summary.json").total;
const be = read("backend/coverage-summary.json").data[0].totals;
const current = {
  frontend: { lines: round(fe.lines.pct), branches: round(fe.branches.pct) },
  backend: { lines: round(be.lines.percent) },
};

if (process.argv.includes("--update")) {
  writeFileSync("coverage-baseline.json", JSON.stringify(current, null, 2) + "\n");
  console.log("Wrote coverage-baseline.json", current);
  process.exit(0);
}

const baseline = read("coverage-baseline.json");
const rows = [];
let failed = false;
for (const [stack, metrics] of Object.entries(current)) {
  for (const [metric, now] of Object.entries(metrics)) {
    const was = baseline[stack][metric];
    if (was == null) {
      rows.push(`| ${stack} | ${metric} | not set | ${now}% | | set it with --update |`);
      continue;
    }
    const delta = round(now - was);
    const bad = delta < -TOLERANCE;
    failed ||= bad;
    rows.push(`| ${stack} | ${metric} | ${was}% | ${now}% | ${delta >= 0 ? "+" : ""}${delta} | ${bad ? "FAIL" : "ok"} |`);
  }
}
if (process.env.GITHUB_ACTIONS) {
  // A notice shows the numbers on the PR's checks page without opening the job log.
  const flat = Object.entries(current).flatMap(([s, m]) => Object.entries(m).map(([k, v]) => `${s} ${k} ${v}%`));
  console.error(`::notice title=Coverage::${flat.join(", ")}`);
}
console.log(["## Coverage", "", "| Stack | Metric | Baseline | Now | Change | |", "|---|---|---|---|---|---|", ...rows].join("\n"));
if (failed) {
  console.log(`\nCoverage dropped by more than ${TOLERANCE} points. Add tests, or see docs on raising/lowering the baseline.`);
  process.exit(1);
}
