import type { ReactNode } from "react";

/** A closed-by-default note: a label you tap to open it. Native `details`, so it works without script. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="max-w-measure border-t border-rule text-small text-ink-muted">
      <summary className="label flex min-h-control cursor-pointer items-center text-ink">{summary}</summary>
      <div className="flex flex-col gap-3 pb-2">{children}</div>
    </details>
  );
}
