import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/**
 * The charcoal band above the masthead, on every signed-in screen. Left: the reader's day, the season and (when known)
 * how many recipes the household has, as one uppercase label line. Right: `children`, the account actions (Sign out).
 * It bleeds across the whole window, side insets included, while its content keeps the page's edges. The season drops
 * out on a phone so the line has room beside the button; whatever is left may wrap rather than overflow.
 */
export function TopBand({
  date,
  dateTime,
  season,
  count,
  children,
}: {
  /** "Sunday, October 25". */
  date: string;
  /** The same day as YYYY-MM-DD. */
  dateTime: string;
  season: string;
  /** The household's recipe count. Leave it out when the page could not know it. */
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="-ms-[env(safe-area-inset-left)] -me-[env(safe-area-inset-right)] bg-band ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] text-on-band [--focus-offset:-4px] [--focus-ring:var(--color-band-accent)] print:hidden">
      <div className="mx-auto flex min-h-control w-full max-w-page items-center justify-between gap-x-4 px-gutter">
        <p className="label-quiet min-w-0 py-1 max-sm:tracking-[0.07em]">
          <time dateTime={dateTime}>{date}</time>
          <span className="max-sm:hidden">{` · ${season}`}</span>
          {count !== undefined && (
            <>
              {" · "}
              <span className="whitespace-nowrap">{`${count} ${count === 1 ? "recipe" : "recipes"}`}</span>
            </>
          )}
        </p>
        {children}
      </div>
    </div>
  );
}

/** An action in the band (Sign out): a label with a 44px target that lights up in the band accent. */
export function BandButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "label-quiet -me-3 inline-flex min-h-control shrink-0 items-center whitespace-nowrap px-3 text-on-band underline decoration-transparent decoration-1 underline-offset-[0.3em] transition-[color,text-decoration-color] duration-150 ease-out hover:text-band-accent hover:decoration-band-accent disabled:opacity-55 max-sm:tracking-[0.07em]",
        className,
      )}
      {...rest}
    />
  );
}
