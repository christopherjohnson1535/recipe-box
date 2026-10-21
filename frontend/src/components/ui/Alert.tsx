import type { ReactNode } from "react";
import { cx } from "./cx";

/** Inline message. `error` is announced to screen readers as soon as it appears. */
export function Alert({ tone = "info", title, children }: { tone?: "info" | "error"; title?: string; children?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-control border px-4 py-3 text-sm",
        tone === "error" ? "border-danger bg-danger-soft text-text" : "border-border bg-surface-sunk text-text",
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1 text-muted" : undefined}>{children}</div>}
    </div>
  );
}
