import type { ReactNode } from "react";

/* Pieces of the article layout a recipe page is set in. The opener, numerals, ingredients, method and bar have their own files. */

/** Opening paragraph with an accent drop cap. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="drop-cap mx-auto max-w-measure text-deck text-ink [overflow-wrap:anywhere]">{children}</p>;
}

/** Two columns from 768px: the ingredient sidebar beside the main text, on the same edges as the masthead. Stacks on phones. */
export function SidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-12 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-14 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
      {sidebar}
      {children}
    </div>
  );
}
