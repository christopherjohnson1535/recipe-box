import type { ReactNode } from "react";
import { cx } from "./cx";

/** Inline message set as a margin note. `error` is announced to screen readers as soon as it appears. */
export function Alert({ tone = "info", title, children }: { tone?: "info" | "error"; title?: string; children?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "border-l-[3px] bg-paper-deep px-5 py-4 text-small text-ink",
        tone === "error" ? "border-danger" : "border-ink-muted",
      )}
    >
      {title && <p className={cx("label", tone === "error" ? "text-danger" : "text-ink")}>{title}</p>}
      {children && <div className={title ? "mt-1.5" : undefined}>{children}</div>}
    </div>
  );
}
