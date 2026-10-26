import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-text";

const base =
  "label inline-flex min-h-control items-center justify-center gap-2 whitespace-nowrap rounded-control max-sm:max-w-full max-sm:py-2 max-sm:whitespace-normal transition-[background-color,border-color,color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";
const variants: Record<Variant, string> = {
  primary:
    "px-4 max-sm:text-center bg-(--button-primary-bg) text-(--button-primary-fg) hover:bg-(--button-primary-bg-hover) hover:text-(--button-primary-fg-hover)",
  secondary:
    "px-5 max-sm:text-center border border-(--button-secondary-border) text-(--button-secondary-fg) hover:border-(--button-secondary-hover) hover:text-(--button-secondary-hover)",
  ghost:
    "min-w-control px-0 text-(--button-ghost-fg) underline decoration-(--button-ghost-underline) underline-offset-[0.3em] hover:text-(--button-ghost-hover) hover:decoration-(--button-ghost-hover)",
  // A destructive action set as text: the ghost shape in the danger colour. The filled `danger` is for the confirm step.
  // Disabled or pending it falls back to the quiet ghost colours (the pink at the base's opacity is too faint) and does not recolour on hover.
  "danger-text":
    "min-w-control px-0 text-(--button-danger-text-fg) underline decoration-(--button-danger-text-underline) underline-offset-[0.3em] not-disabled:not-aria-disabled:hover:text-(--button-danger-text-hover) not-disabled:not-aria-disabled:hover:decoration-(--button-danger-text-hover) disabled:text-(--button-ghost-fg) disabled:decoration-(--button-ghost-underline) aria-disabled:text-(--button-ghost-fg) aria-disabled:decoration-(--button-ghost-underline)",
  danger: "px-5 max-sm:text-center bg-(--button-danger-bg) text-(--button-danger-fg) hover:bg-(--button-danger-bg-hover)",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cx(base, variants[variant], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; pending?: boolean };

export function Button({ variant, pending, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({ variant, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

/**
 * A link that leaves the app for a full page load (the API's connect address, which answers with a redirect to Google), so
 * not next/link, which would prefetch it. With a `variant` it is set as that button; without, as an inline link.
 */
export function HardLink({ variant, className, ...rest }: ComponentProps<"a"> & { variant?: Variant }) {
  return <a className={variant ? buttonClass(variant, className) : cx("link", className)} {...rest} />;
}
