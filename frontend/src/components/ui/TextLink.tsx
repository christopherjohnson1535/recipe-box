import Link from "next/link";
import type { ReactNode } from "react";

/** Underlined accent link to another page of this app. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="link">
      {children}
    </Link>
  );
}
