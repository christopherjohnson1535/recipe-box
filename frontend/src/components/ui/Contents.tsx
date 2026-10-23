"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { markArrived } from "./Arrive";
import { Morph, photoName, rememberPhoto, recipeArrivalKey, titleName } from "./morph";

/** The contents listing: entries between hairlines, two columns from 1024px. Entries keep source order
 * (left to right, then down), so reading and focus order match what is seen. Children are `<ContentsEntry>`s. */
export function Contents({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 items-start gap-x-14 border-b border-(--rule-hair) lg:grid-cols-2">
      {children}
    </ul>
  );
}

type EntryProps = {
  href: string;
  title: string;
  /** Small accent line above the title, e.g. tags. */
  kicker?: ReactNode;
  /** Italic line under the title, clamped to two lines. */
  deck?: string;
  /** Uppercase muted line at the foot, e.g. total time. */
  meta?: ReactNode;
  /** Thumbnail on the right. Decorative: the title already names it. */
  imageSrc?: string | null;
  /** Position in the list: entries arrive 120 ms apart on a first visit (capped, so a long list does not crawl). */
  index?: number;
  /** Recipe id: the photo and title morph into the recipe page, which then skips its own arrival animation. */
  morphId?: string;
};

/** One entry in the contents. The whole entry is the link target; the focus ring wraps the entry. */
export function ContentsEntry({ href, title, kicker, deck, meta, imageSrc, index = 0, morphId }: EntryProps) {
  return (
    <li className="stagger-item" style={{ "--i": Math.min(index, 8) } as CSSProperties}>
      <article className="group relative flex gap-5 border-t border-(--rule-hair) py-6 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-(--focus-ring) sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {kicker && <div className="label text-(--entry-kicker-fg)">{kicker}</div>}
          <h2 className="font-display text-title-sm text-ink transition-[color] duration-150 ease-out group-hover:text-(--entry-title-hover)">
            <Morph name={morphId ? titleName(morphId) : undefined}>
              <Link
                href={href}
                title={title}
                onClick={
                  morphId
                    ? (e) => {
                        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab/window is not this tab's arrival
                        markArrived(recipeArrivalKey(morphId));
                        rememberPhoto(morphId, Boolean(imageSrc));
                      }
                    : undefined
                }
                className="line-clamp-2 after:absolute after:inset-0 focus-visible:outline-none"
              >
                {title}
              </Link>
            </Morph>
          </h2>
          {deck && <p className="line-clamp-2 text-body text-ink-muted italic">{deck}</p>}
          {meta && <p className="label mt-1 text-ink-muted">{meta}</p>}
        </div>
        {imageSrc && (
          // Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send.
          <Morph name={morphId ? photoName(morphId) : undefined}>
            <img
              src={imageSrc}
              alt=""
              width={160}
              height={120}
              loading="lazy"
              className="aspect-[4/3] h-auto w-24 shrink-0 self-start object-cover sm:w-36 [filter:var(--photo-filter)]"
            />
          </Morph>
        )}
      </article>
    </li>
  );
}
