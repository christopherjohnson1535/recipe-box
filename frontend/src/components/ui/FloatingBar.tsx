import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A pill fixed at the bottom of the screen: a status line and the Start cooking link. Hidden in print. The status is a
 * polite live region. Pages leave room under their last content (`pb-28`) so it never hides anything.
 */
export function FloatingBar({ status, href, action }: { status: ReactNode; href: string; action: string }) {
  return (
    <div className="floating-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] print:hidden">
      <div className="bar-in pointer-events-auto flex max-w-full items-center gap-4 rounded-full border border-(--rule-hair) bg-(--bar-bg) py-2 pr-2 pl-6 text-(--bar-fg)">
        <p role="status" className="label min-w-0">
          {status}
        </p>
        <Link
          href={href}
          className="label inline-flex min-h-control shrink-0 items-center rounded-full bg-(--bar-action-bg) px-5 whitespace-nowrap text-(--bar-action-fg) focus-visible:outline-(--bar-focus)"
        >
          {action} <span aria-hidden="true">&nbsp;→</span>
        </Link>
      </div>
    </div>
  );
}
