import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "min-h-control w-full min-w-0 rounded-control border border-rule-strong bg-paper px-3 text-body text-ink placeholder:text-ink-muted placeholder:italic",
        "transition-[border-color] duration-150 ease-out hover:border-ink aria-invalid:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...rest}
    />
  );
}
