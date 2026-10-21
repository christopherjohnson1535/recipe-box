import type { ReactNode } from "react";

type EmptyStateProps = { title: string; children?: ReactNode; actions?: ReactNode; icon?: ReactNode };

export function EmptyState({ title, children, actions, icon }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-card border border-dashed border-border-strong bg-surface-sunk px-6 py-10 sm:px-10">
      {icon && <div className="text-accent">{icon}</div>}
      <h2 className="text-2xl font-semibold text-text">{title}</h2>
      {children && <div className="max-w-prose text-muted">{children}</div>}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </section>
  );
}
