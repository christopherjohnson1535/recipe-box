import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Logo } from "./Logo";

/** The app's masthead: wordmark linking home on the left, section links on the right, a double rule under. */
export function Masthead({ children }: { children: ReactNode }) {
  return (
    <header className="mx-auto w-full max-w-page px-gutter pt-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 pb-2">
        <Link href="/" className="inline-flex min-h-control items-center" aria-label="Recipe Box home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex max-w-full items-center overflow-x-auto">
          {children}
        </nav>
      </div>
      <div className="rule-double" aria-hidden="true" />
    </header>
  );
}

const navItem =
  "label-quiet inline-flex min-h-control items-center whitespace-nowrap border-b-2 max-sm:ps-0 max-sm:pe-3 max-sm:text-[0.8125rem] max-sm:tracking-[0.07em] sm:px-2.5 transition-[border-color,color] duration-150 ease-out";
const idle = "border-transparent text-(--nav-fg) hover:text-(--nav-fg-active)";

/** A section link in the masthead; `active` marks the current section. */
export function NavLink({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(navItem, active ? "border-(--nav-underline-active) font-semibold text-(--nav-fg-active)" : idle)}
    >
      {children}
    </Link>
  );
}

/** An action in the masthead that looks like a section link (Sign out). */
export function NavButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cx(navItem, idle, "disabled:opacity-55", className)} {...rest} />;
}
