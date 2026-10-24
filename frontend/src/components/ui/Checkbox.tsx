import type { ReactNode } from "react";

type CheckboxProps = { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean };

/** One on/off choice: a 44px row with an italic hint, styled like the radio rows of ChoiceGroup. */
export function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  return (
    <label className="flex min-h-control cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 accent-(--link-fg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
      />
      <span className="text-body text-ink">
        {label}
        {hint && <span className="block text-small text-ink-muted italic">{hint}</span>}
      </span>
    </label>
  );
}
