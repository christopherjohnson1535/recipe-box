"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { markArrived } from "./Arrive";
import { cx } from "./cx";
import { Morph, photoName, rememberPhoto, rememberTitle, recipeArrivalKey, titleName } from "./morph";
import { SpotIcon } from "./SpotIcon";
import type { SpotName } from "./spot-icons";

/**
 * The home grid: one column on a phone, two from 640px, three from 1180px (written as pixel breakpoints: Tailwind sorts `sm:` after an arbitrary `min-[…px]:`, which would cancel the third column). A grid of exactly two or four recipes keeps
 * two columns at that width (three would leave one tile alone on the last row). Children are `<RecipeTile>`s.
 */
export function TileGrid({ label, count, children }: { label?: string; count?: number; children: ReactNode }) {
  const two = count === 2 || count === 4;
  return (
    <ul
      aria-label={label}
      className={cx("grid grid-cols-1 gap-x-6 gap-y-12 min-[640px]:grid-cols-2", !two && "min-[1180px]:grid-cols-3")}
    >
      {children}
    </ul>
  );
}

/** The grid beside its sidebar: side by side from 1024px, the sidebar below the grid on an iPad held upright and on a phone. */
export function HomeLayout({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={aside ? "grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-12" : undefined}>
      <div className="min-w-0">{children}</div>
      {aside && <div className="flex flex-col gap-10">{aside}</div>}
    </div>
  );
}

type CardProps = {
  href: string;
  title: string;
  /** Small accent line left of the time, e.g. tags. */
  kicker?: ReactNode;
  /** Total time, right of the kicker. */
  time?: ReactNode;
  /** Italic line under the title, clamped to two lines. */
  deck?: string;
  imageSrc?: string | null;
  /** Drawn on paper when there is no photo. */
  fallbackIcon: SpotName;
  /** Position in the grid: cards arrive 120 ms apart on a first visit (capped). */
  index?: number;
  /** Recipe id: the photo and title morph into the recipe page. */
  morphId?: string;
};

/**
 * One recipe in the home grid: a 1px ink rule, a kicker line with tags and time, a 3:2 photo (or a paper plate with a
 * spot icon), a display title and a two-line deck. A tile narrower than 17rem keeps only the first tag so the kicker stays
 * on one line and the photos in a row stay level. On hover and on keyboard focus the plate scales and turns and the title draws a
 * accent underline (motion.css); under reduced motion only the underline and colour change. The whole card is the link.
 */
export function RecipeTile({ href, title, kicker, time, deck, imageSrc, fallbackIcon, index = 0, morphId }: CardProps) {
  return (
    <li className="stagger-item" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
      <article className="recipe-tile @container group relative flex flex-col gap-3 border-t border-(--rule-double) pt-3 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-(--focus-ring)">
        <div className="flex min-h-[1.1rem] items-baseline justify-between gap-4">
          <div className="label min-w-0 text-(--kicker-fg) @max-[17rem]:[&_li:first-child::after]:hidden @max-[17rem]:[&_li+li]:hidden">{kicker}</div>
          {time && <p className="label shrink-0 text-ink-muted">{time}</p>}
        </div>
        <div className="aspect-[3/2] overflow-hidden bg-(--panel-bg)">
          {imageSrc ? (
            // Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send.
            <Morph name={morphId ? photoName(morphId) : undefined}>
              <img
                src={imageSrc}
                alt=""
                width={720}
                height={480}
                loading="lazy"
                className="plate-img size-full object-cover [filter:var(--photo-filter)]"
              />
            </Morph>
          ) : (
            <div className="flex size-full items-center justify-center">
              <span className="plate-img">
                <SpotIcon name={fallbackIcon} size={56} />
              </span>
            </div>
          )}
        </div>
        <h2 className="font-display text-title-sm text-ink [overflow-wrap:anywhere] transition-[color] duration-150 ease-out group-hover:text-(--entry-title-hover)">
          <Morph name={morphId ? titleName(morphId) : undefined}>
            <Link
              href={href}
              onClick={
                morphId
                  ? (e) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab/window is not this tab's arrival
                      markArrived(recipeArrivalKey(morphId));
                      rememberPhoto(morphId, Boolean(imageSrc));
                      rememberTitle(morphId, title);
                    }
                  : undefined
              }
              className="after:absolute after:inset-0 focus-visible:outline-none!"
            >
              <span className="title-draw">{title}</span>
            </Link>
          </Morph>
        </h2>
        {deck && <p className="line-clamp-2 text-body text-ink-muted italic">{deck}</p>}
      </article>
    </li>
  );
}
