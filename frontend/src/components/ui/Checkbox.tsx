import { useId, type ReactNode } from "react";

type CheckboxProps = { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean };

/** One on/off choice: a 44px row with an italic hint, styled like the radio rows of ChoiceGroup. */
export function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  const hintId = useId();
  return (
    <label className="flex min-h-control cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="relative mt-1 size-5 shrink-0 appearance-none rounded-xs border border-(--input-border) bg-(--input-bg) checked:border-(--link-fg) checked:bg-(--link-fg) checked:after:absolute checked:after:top-[1px] checked:after:left-[5px] checked:after:h-[11px] checked:after:w-[6px] checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-(--input-bg) checked:after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
      />
      <span className="text-body text-ink">
        {label}
        {hint && <span id={hintId} className="block text-small text-ink-muted italic">{hint}</span>}
      </span>
    </label>
  );
}
