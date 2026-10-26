import type { ElementType, ReactNode } from "react";

/**
 * Help under a field, control or list of steps: small, italic, muted, the same voice as the hint in `Field`, `Checkbox`
 * and `ChoiceGroup`. Explanations of a whole section are `Text` (body size), never this.
 */
export function Hint({ as: Tag = "p", id, children }: { as?: ElementType; id?: string; children: ReactNode }) {
  return (
    <Tag id={id} className="font-text text-small text-ink-muted normal-case tracking-normal font-normal italic [overflow-wrap:anywhere]">
      {children}
    </Tag>
  );
}
