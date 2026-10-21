import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "label inline-flex min-h-control items-center justify-center gap-2 whitespace-nowrap rounded-control px-5 transition-[background-color,border-color,color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55";
const variants: Record<Variant, string> = {
  primary:
    "bg-(--button-primary-bg) text-(--button-primary-fg) hover:bg-(--button-primary-bg-hover) hover:text-(--button-primary-fg-hover)",
  secondary:
    "border border-(--button-secondary-border) text-(--button-secondary-fg) hover:border-(--button-secondary-hover) hover:text-(--button-secondary-hover)",
  ghost:
    "px-2 text-(--button-ghost-fg) underline decoration-(--button-ghost-underline) underline-offset-[0.3em] hover:text-(--button-ghost-hover) hover:decoration-(--button-ghost-hover)",
  danger: "bg-(--button-danger-bg) text-(--button-danger-fg) hover:bg-(--button-danger-bg-hover)",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cx(base, variants[variant], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean };

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
