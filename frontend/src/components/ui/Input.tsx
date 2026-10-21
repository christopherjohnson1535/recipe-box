import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "min-h-control w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text placeholder:text-muted",
        "transition-[border-color] duration-150 ease-out hover:border-accent aria-invalid:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...rest}
    />
  );
}
