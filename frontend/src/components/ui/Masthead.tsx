import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Logo } from "./Logo";

/**
 * The app's masthead: wordmark linking home on the left, section links on the right, a thin double rule under. It is a
 * plain block: the page's `<header>` (the one banner landmark) wraps it and the top band.
 */
export function Masthead({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-page px-gutter pt-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 pb-2">
        <Link href="/" className="inline-flex min-h-control items-center" aria-label="Recipe Box home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="grid w-full max-w-full grid-cols-[auto_auto_auto] justify-between sm:flex sm:ms-auto sm:w-auto sm:flex-nowrap sm:items-center sm:-me-2.5">
          {children}
        </nav>
      </div>
      <div className="rule-double" aria-hidden="true" />
    </div>
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
