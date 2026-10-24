import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A pill fixed at the bottom of the screen: a status line and the Start cooking link. Slides in when `shown` (hidden otherwise: inert, not focusable). Hidden in print. The status is a
 * polite live region, in a short form below 640px so it stays on one line (the hidden form is display:none, not read). Pages leave room under their last content (`pb-28`) so it never hides anything.
 */
export function FloatingBar({ status, shortStatus, href, action, shown = true }: { status: ReactNode; shortStatus: ReactNode; href: string; action: string; shown?: boolean }) {
  return (
    <div data-shown={shown} aria-hidden={!shown || undefined} inert={!shown} className="floating-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+1rem)] print:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-(--rule-hair) bg-(--bar-bg) py-2 pr-2 pl-6 text-(--bar-fg)">
        <p role="status" className="label min-w-0 whitespace-nowrap">
          <span className="sm:hidden">{shortStatus}</span>
          <span className="hidden sm:inline">{status}</span>
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
