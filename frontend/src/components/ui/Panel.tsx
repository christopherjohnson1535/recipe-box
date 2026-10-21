import type { ReactNode } from "react";

/** A tinted block set into the page (paper-deep): an inline form or confirmation that belongs to the row above it. */
export function Panel({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-4 bg-(--panel-bg) p-5">
      {children}
    </div>
  );
}
