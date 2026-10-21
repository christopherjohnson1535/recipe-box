import type { ReactNode } from "react";

type FieldProps = { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode };

/** Label + control + hint/error. Give the control `aria-describedby={`${htmlFor}-msg`}` when hint or error is set. */
export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {message && (
        <p id={`${htmlFor}-msg`} className={error ? "text-small text-danger" : "text-small text-ink-muted italic"}>
          {message}
        </p>
      )}
    </div>
  );
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="label text-ink">
      {children}
    </label>
  );
}
