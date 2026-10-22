import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** Heading level of the title: 1 when it is the only heading on the page (not found, error), else 2. */
  level?: 1 | 2;
};

/** A quiet editor's note: hairlines above and below, display title, italic copy. */
export function EmptyState({ title, children, actions, icon, level = 2 }: EmptyStateProps) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <section className="flex flex-col items-start gap-4 border-b border-(--rule-hair) pt-2 pb-10 sm:pb-14">
      {icon && <div className="text-(--kicker-fg)">{icon}</div>}
      <Title className="font-display text-title text-ink [overflow-wrap:anywhere]">{title}</Title>
      {children && <div className="max-w-measure text-deck text-ink-muted italic">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
    </section>
  );
}
