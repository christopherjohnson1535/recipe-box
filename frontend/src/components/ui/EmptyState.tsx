import type { ReactNode } from "react";

type EmptyStateProps = { title: string; children?: ReactNode; actions?: ReactNode; icon?: ReactNode };

/** A quiet editor's note: hairlines above and below, display title, italic copy. */
export function EmptyState({ title, children, actions, icon }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-start gap-4 border-b border-rule pt-2 pb-10 sm:pb-14">
      {icon && <div className="text-accent">{icon}</div>}
      <h2 className="font-display text-title text-ink">{title}</h2>
      {children && <div className="max-w-measure text-deck text-ink-muted italic">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
    </section>
  );
}
