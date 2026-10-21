import type { ReactNode } from "react";

/** A request in flight: says what is happening and how long it can take, with a quiet bar and an optional way out. */
export function Pending({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-3 border-l-[3px] border-(--alert-rule) bg-(--alert-bg) px-5 py-4">
      <p className="text-small text-(--alert-fg) italic">{children}</p>
      <div className="h-0.5 w-full overflow-hidden bg-(--rule-hair)" aria-hidden="true">
        <div className="h-full w-1/3 animate-pulse bg-(--progress-fg) motion-reduce:animate-none" />
      </div>
      {action && <div className="flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
