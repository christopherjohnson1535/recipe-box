import type { ReactNode } from "react";

/* Pieces of the article layout a recipe page is set in. The opener, numerals, ingredients, method and bar have their own files. */

/** Opening paragraph with an accent drop cap. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="drop-cap max-w-measure text-deck text-ink [overflow-wrap:anywhere]">{children}</p>;
}

/**
 * The ingredient sidebar beside the method, on the same edges as the masthead; stacked on phones. From 1440px a third
 * column holds the `rail` (the recipe's note, set as a margin note); below that the rail follows the method in the
 * method's column. The method keeps its own reading measure whichever columns are showing.
 */
export function SidebarLayout({ sidebar, rail, children }: { sidebar: ReactNode; rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid w-full max-w-page grid-cols-1 gap-x-14 gap-y-12 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-y-8 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] min-[90rem]:grid-cols-[minmax(0,22rem)_minmax(0,38rem)_minmax(0,1fr)]">
      <div className="md:row-span-2">{sidebar}</div>
      {children}
      {rail && <div className="min-w-0 md:col-start-2 md:max-w-measure min-[90rem]:max-w-none min-[90rem]:col-start-3 min-[90rem]:row-start-1">{rail}</div>}
    </div>
  );
}

/** Caption under the lead photo: opens the untouched original at full size in a new tab (PHO-7). */
export function PlateCaption({ href }: { href: string }) {
  return (
    // -mt-8 cancels most of the 40px gap the article's column puts above it, so the caption sits just under the plate.
    <p className="-mt-8 flex justify-end lg:mt-0 print:hidden">
      <a href={href} target="_blank" rel="noopener" className="link inline-flex min-h-control items-start pt-2 text-small italic">
        View the original photo
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
