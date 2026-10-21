import type { ReactNode } from "react";

/** Underlined accent link to another site. Opens in a new tab without passing the opener. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link break-words">
      {children}
    </a>
  );
}
