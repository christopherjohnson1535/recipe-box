import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A `tar` that wraps the real one and misbehaves on demand (SHIM_TAR_MODE), to reach backup branches that cannot be
 * triggered deterministically any other way. Pass the result as script environment.
 *  - changed: archiving exits 1, as GNU tar does when a file changed or vanished while it was read
 *  - unreadable: reading the archive back fails
 */
export function tarShimEnv(mode: "changed" | "unreadable"): Record<string, string> {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-tarshim-"));
  const script = path.join(dir, "tar");
  writeFileSync(
    script,
    `#!/bin/sh
case "$1" in --version) exec "$REAL_TAR" "$@" ;; esac
case "$SHIM_TAR_MODE:$*" in unreadable:*-xOf*) exit 2 ;; esac
"$REAL_TAR" "$@"
rc=$?
case "$SHIM_TAR_MODE:$*" in changed:*-cf*) exit 1 ;; esac
exit $rc
`,
  );
  chmodSync(script, 0o755);
  return {
    PATH: `${dir}:${process.env.PATH ?? ""}`,
    REAL_TAR: execFileSync("sh", ["-c", "command -v tar"], { encoding: "utf8" }).trim(),
    SHIM_TAR_MODE: mode,
  };
}
