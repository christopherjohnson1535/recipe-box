import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ButtonLink } from "./Button";
import { FadeImage } from "./FadeImage";

/**
 * The home page's featured recipe: a kicker, a large headline (an h2: the page's h1 is a visually hidden "Recipes"
 * beside it), an italic deck, a meta strip between two hairlines (total time, servings where known) and the actions on
 * the left (Start cooking in ink, Read the recipe as an accent link); the photo, 3:2 with a hairline outline set 8px off it, on the right (above the headline on a phone). The
 * headline's words rise in on a first visit.
 */
export function FeaturedRecipe({
  title,
  kicker,
  deck,
  meta,
  imageSrc,
  cookHref,
  readHref,
}: {
  title: string;
  kicker: ReactNode;
  deck?: string;
  /** Total time and servings; the strip is left out when there is nothing to show. */
  meta?: ReactNode;
  imageSrc: string;
  /** "Start cooking" (ink fill). */
  cookHref: string;
  /** "Read the recipe" (accent text link). */
  readHref: string;
}) {
  return (
    <article className="grid gap-y-8 lg:grid-cols-[1fr_1.4fr] lg:items-center lg:gap-x-14">
      <div className="flex min-w-0 flex-col gap-5 lg:py-4">
        <p className="label text-(--kicker-fg)">{kicker}</p>
        <h2 className="font-display text-headline text-balance text-ink [overflow-wrap:anywhere]">
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
        {meta && <p className="label border-y border-(--rule-hair) py-3 text-ink-muted">{meta}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
          <ButtonLink href={cookHref} className="max-sm:w-full">
            Start cooking
          </ButtonLink>
          <Link href={readHref} className="link label inline-flex min-h-control items-center max-sm:w-full max-sm:justify-center">
            Read the recipe
          </Link>
        </div>
      </div>
      {/* The 9px of padding hold the outline (1px, set 8px off the photo) inside the column. */}
      {/* Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send. */}
      <div className="order-first p-[9px] lg:order-last">
        <FadeImage
          src={imageSrc}
          alt=""
          width={1200}
          height={800}
          fetchPriority="high"
          className="aspect-[3/2] h-auto w-full bg-(--panel-bg) object-cover outline-1 outline-offset-8 outline-(--rule-hair) [filter:var(--photo-filter)]"
        />
      </div>
    </article>
  );
}
