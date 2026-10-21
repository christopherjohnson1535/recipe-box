import type { ReactNode } from "react";

/** A titled group of form controls: uppercase legend over a hairline, optional italic hint, then the controls. */
export function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="label mb-4 block w-full border-b border-(--rule-hair) pb-2 text-ink">{legend}</legend>
      <div className="flex flex-col gap-5">
        {hint && <p className="text-small text-ink-muted italic">{hint}</p>}
        {children}
      </div>
    </fieldset>
  );
}
