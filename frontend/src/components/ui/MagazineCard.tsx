"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { markArrived } from "./Arrive";
import { Morph, photoName, rememberPhoto, rememberTitle, recipeArrivalKey, titleName } from "./morph";
import { SpotIcon } from "./SpotIcon";
import type { SpotName } from "./spot-icons";

/** The home grid: one column on a phone, two from 640px. Children are `<MagazineCard>`s. */
export function CardGrid({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2">
      {children}
    </ul>
  );
}

/** The grid beside its sidebar: side by side from 1024px, the sidebar below the grid on an iPad held upright and on a phone. */
export function IssueLayout({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={aside ? "grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-14" : undefined}>
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
 * One recipe in the home grid: a 4:3 photo (or a paper plate with a spot icon), a kicker line with tags and time, a
 * display title and a two-line deck. On hover and on keyboard focus the plate scales and turns and the title draws a
 * accent underline (motion.css); under reduced motion only the underline and colour change. The whole card is the link.
 */
export function MagazineCard({ href, title, kicker, time, deck, imageSrc, fallbackIcon, index = 0, morphId }: CardProps) {
  return (
    <li className="stagger-item" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
      <article className="mag-card group relative flex flex-col gap-3 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-(--focus-ring)">
        <div className={"aspect-[4/3] overflow-hidden border border-(--rule-hair) bg-(--panel-bg)"}>
          {imageSrc ? (
            // Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send.
            <Morph name={morphId ? photoName(morphId) : undefined}>
              <img
                src={imageSrc}
                alt=""
                width={640}
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
        <div className="flex items-baseline justify-between gap-4">
          <div className="label min-w-0 text-(--entry-kicker-fg)">{kicker}</div>
          {time && <p className="label shrink-0 text-ink-muted">{time}</p>}
        </div>
        <h2 className="font-display text-[1.875rem] leading-[1.1] text-ink [overflow-wrap:anywhere] transition-[color] duration-150 ease-out group-hover:text-(--entry-title-hover)">
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
