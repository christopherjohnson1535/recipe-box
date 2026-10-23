import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * The home page's cover: kicker, a very large headline (an h2: the page's h1 is a visually hidden "Recipes" beside it), italic deck, a meta line and buttons on the
 * left, the photo on the right (above the headline on a phone). The headline's words rise in on a first visit.
 */
export function CoverStory({
  title,
  kicker,
  deck,
  meta,
  imageSrc,
  actions,
}: {
  title: string;
  kicker: ReactNode;
  deck?: string;
  meta?: ReactNode;
  imageSrc: string;
  actions: ReactNode;
}) {
  return (
    <article className="grid gap-y-8 lg:grid-cols-2 lg:items-center lg:gap-x-14">
      <div className="flex min-w-0 flex-col gap-5 lg:py-6">
        <p className="label text-(--kicker-fg)">{kicker}</p>
        <h2 className="font-display text-[clamp(2.75rem,1.2rem+6vw,5.625rem)] leading-[1.02] text-balance text-ink [overflow-wrap:anywhere]">
          {title.split(" ").map((word, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="rise-word" style={{ "--w": Math.min(i, 8) } as CSSProperties}>
                {word}
              </span>
            </Fragment>
          ))}
        </h2>
        {deck && <p className="max-w-measure text-deck text-ink-muted italic [overflow-wrap:anywhere]">{deck}</p>}
        {meta && <p className="label text-ink-muted">{meta}</p>}
        <div className="mt-2 flex flex-wrap gap-3 max-sm:[&>*]:w-full print:hidden">{actions}</div>
      </div>
      {/* Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send. */}
      <img
        src={imageSrc}
        alt=""
        width={1200}
        height={900}
        fetchPriority="high"
        className="order-first aspect-[4/3] h-auto w-full object-cover lg:order-last lg:aspect-square [filter:var(--photo-filter)]"
      />
    </article>
  );
}
