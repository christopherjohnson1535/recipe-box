"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarLayout } from "./Article";
import { Contents } from "./Contents";
import { cx } from "./cx";
import { hasPhotoFor, Morph, photoName, titleName } from "./morph";
import { Pending } from "./Pending";

/** One placeholder box: the static skeleton tint with a soft highlight in the middle. Nothing moves. Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "bg-linear-to-r from-(--skeleton-bg) via-(--skeleton-shine) to-(--skeleton-bg)",
        className,
      )}
    />
  );
}

/** A bar set in a real text style, so the line is exactly as tall as the text that replaces it. `type` is that style. */
function TextBar({ type, className, center }: { type: string; className: string; center?: boolean }) {
  return (
    <div className={cx(type, center && "text-center")} aria-hidden="true">
      <Skeleton className={cx("inline-block h-[0.7em] align-middle", className)} />
    </div>
  );
}

/** What a screen reader hears for the whole skeleton; the boxes themselves are hidden. */
function Loading({ children }: { children: ReactNode }) {
  return (
    <>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div aria-hidden="true">{children}</div>
    </>
  );
}

function EntrySkeleton() {
  return (
    <li>
      <div className="flex gap-5 border-t border-(--rule-hair) py-6 sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TextBar type="label" className="w-24" />
          <TextBar type="font-display text-title-sm" className="w-4/5" />
          <TextBar type="text-body" className="w-full" />
          <TextBar type="label mt-1" className="w-16" />
        </div>
        <Skeleton className="aspect-[4/3] w-24 shrink-0 self-start sm:w-36" />
      </div>
    </li>
  );
}

/** The home page's shape: head, search row, tag index, contents entries. Other (app) routes get the plain note. */
export function HomeSkeleton() {
  const path = usePathname();
  if (path !== "/") return <Pending>Loading…</Pending>;
  return (
    <Loading>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4 border-b border-(--rule-hair) pb-8">
          <TextBar type="label" className="w-32" />
          <TextBar type="font-display text-headline" className="w-2/3 max-w-md" />
          <TextBar type="text-deck" className="w-64" />
          <div className="mt-2 flex flex-wrap gap-3">
            <Skeleton className="h-11 w-36" />
            <Skeleton className="h-11 w-24" />
          </div>
        </div>
        {/* The search form (input, then sort on a phone), the tag index (a block from 640px, a summary row below). */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full max-w-xl" />
            <Skeleton className="h-11 w-28 sm:hidden" />
          </div>
          <Skeleton className="hidden h-22 w-full sm:block" />
          <Skeleton className="h-11 w-full sm:hidden" />
        </div>
        <Contents>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <EntrySkeleton key={i} />
          ))}
        </Contents>
      </div>
    </Loading>
  );
}

/**
 * The recipe page's shape: centred head, meta strip, lead photo (only when the tapped card had one), ingredients beside the method. On the recipe's own
 * address the photo and title boxes carry the card's view-transition names, so the tapped card morphs into this
 * skeleton (a loading fallback in the same commit would otherwise break the pairing) and then into the page. Other
 * routes under /recipes/[id] (edit, cook) get the plain note.
 */
export function RecipeSkeleton() {
  const path = usePathname();
  const { id } = useParams<{ id: string }>();
  if (typeof id !== "string" || path !== `/recipes/${id}`) return <Pending>Loading…</Pending>;
  const photo = hasPhotoFor(id);
  return (
    <Loading>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col items-center gap-4 border-b border-(--rule-hair) pb-8 text-center">
          <div className="flex min-h-[25px] items-center">
            <TextBar type="label" className="w-40" center />
          </div>
          <Morph name={titleName(id)}>
            <TextBar type="font-display text-headline" className="w-72 max-w-full" center />
          </Morph>
          <TextBar type="text-deck" className="w-80 max-w-full" center />
          <TextBar type="label" className="w-56 max-w-full" center />
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Skeleton className="h-11 w-full sm:w-40" />
            <Skeleton className="h-11 w-20" />
            <Skeleton className="h-11 w-24" />
          </div>
        </div>
        <div className="-mt-4 flex flex-col items-center gap-2">
          <TextBar type="label" className="w-64 max-w-full" center />
          <TextBar type="label sm:hidden" className="w-40 max-w-full" center />
        </div>
        {photo && (
          <figure className="mx-auto w-full max-w-page">
            <Morph name={photoName(id)}>
              <Skeleton className="aspect-[3/2] max-h-[36rem] w-full" />
            </Morph>
          </figure>
        )}
        <SidebarLayout
          sidebar={
            <div className="flex flex-col gap-4 self-start bg-(--panel-bg) px-5 pt-1 pb-6 sm:px-6">
              <div className="rule-double -mx-5 sm:-mx-6" />
              <div className="pt-3">
                <TextBar type="label" className="w-28" />
              </div>
              <div className="flex flex-col divide-y divide-(--rule-hair)">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <TextBar key={i} type="py-2.5 text-body leading-snug" className={i % 2 ? "w-2/3" : "w-5/6"} />
                ))}
              </div>
            </div>
          }
        >
          <div className="flex max-w-measure flex-col gap-6">
            <TextBar type="font-display text-title" className="w-40" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                <TextBar type="font-display text-numeral" className="w-6" />
                <div className="flex flex-col gap-2">
                  <TextBar type="text-body" className="w-full" />
                  <TextBar type="text-body" className="w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </SidebarLayout>
      </div>
    </Loading>
  );
}
