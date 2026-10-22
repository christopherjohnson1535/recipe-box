import type { ComponentProps } from "react";
import { cx } from "./cx";

/** The look shared by every text control (Input, Textarea). */
export const inputClass = (className?: string) =>
  cx(
    "min-h-control w-full min-w-0 rounded-control border border-(--input-border) bg-(--input-bg) px-3 text-body text-(--input-fg) placeholder:text-(--input-placeholder) placeholder:italic",
    "transition-[border-color] duration-150 ease-out hover:border-(--input-border-hover) aria-invalid:border-(--input-border-invalid)",
    "disabled:cursor-not-allowed disabled:opacity-55",
    className,
  );

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={inputClass(className)} {...rest} />;
}
