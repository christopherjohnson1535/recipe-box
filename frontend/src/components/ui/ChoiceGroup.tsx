type Option<T extends string> = { value: T; label: string; hint?: string };

type ChoiceGroupProps<T extends string> = {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  disabled?: boolean;
};

/** One-of-few choice as radios, each with a 44px row and an italic hint. */
export function ChoiceGroup<T extends string>({ legend, name, value, onChange, options, disabled }: ChoiceGroupProps<T>) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1" disabled={disabled}>
      <legend className="label mb-2 text-ink">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-control cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-1 size-5 shrink-0 accent-(--link-fg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          />
          <span className="text-body text-ink">
            {o.label}
            {o.hint && <span className="block text-small text-ink-muted italic">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
