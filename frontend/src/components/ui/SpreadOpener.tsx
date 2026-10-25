import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { typographic } from "@/lib/recipe";
import { Morph, photoName, titleName } from "./morph";

type SpreadOpenerProps = {
  title: string;
  /** Tags, set as an accent small-caps line above the headline. */
  kicker?: ReactNode;
  /** Italic standfirst under the headline. */
  deck?: ReactNode;
  byline?: ReactNode;
  actions?: ReactNode;
  /** The lead photo: full height beside the text from 1024px, a 3:2 band below the text on smaller screens. */
  photo?: { src: string; alt: string };
  /** Without a photo, a spot icon stands where the picture would. */
  icon?: ReactNode;
  /** Recipe id: the card this page opened from morphs into the headline and the photo. */
  morphId?: string;
};

/** The actions block's id: the recipe page's floating bar watches it to know when to appear. */
export const OPENER_ACTIONS_ID = "opener-actions";

// Headline sizes step down for long titles so they wrap in a few lines instead of filling the screen.
const HEADLINE = {
  normal: "[font-size:clamp(2.75rem,11vw,4rem)] sm:[font-size:clamp(3.5rem,9vw,5.5rem)] lg:[font-size:clamp(4.25rem,7vw,6.25rem)]",
  long: "[font-size:clamp(2rem,8vw,3rem)] sm:[font-size:clamp(2.5rem,6.5vw,4rem)] lg:[font-size:clamp(3rem,4.6vw,4.5rem)]",
};

/** The recipe page's opener: a split screen with the headline on the left and the photo on the right. */
export function SpreadOpener({ title, kicker, deck, byline, actions, photo, icon, morphId }: SpreadOpenerProps) {
  return (
    <header className={cx("grid", photo && "lg:-mb-10 lg:grid-cols-[1.2fr_1fr]")}>
      <div className={cx("flex min-w-0 flex-col items-start gap-5 pb-8", photo && "lg:min-h-[40rem] lg:justify-end lg:py-12 lg:pr-12")}>
        {!photo && icon && <div className="text-ink">{icon}</div>}
        {kicker && <div className="label text-(--kicker-fg)">{kicker}</div>}
        <Morph name={morphId ? titleName(morphId) : undefined}>
          <h1 className={cx("min-w-0 font-display leading-[0.95] text-ink [overflow-wrap:anywhere] print:break-after-avoid", title.length > 40 ? HEADLINE.long : HEADLINE.normal)}>
            {typographic(title).split(" ").map((word, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                <span className="rise-word" style={{ "--w": Math.min(i, 8) } as CSSProperties}>
                  {word}
                </span>
              </Fragment>
            ))}
          </h1>
        </Morph>
        {deck && <p className="max-w-measure text-deck text-ink-muted italic [overflow-wrap:anywhere]">{deck}</p>}
        {byline && <div className="label text-ink-muted">{byline}</div>}
        {actions && <div id={OPENER_ACTIONS_ID} className="mt-2 flex w-full flex-wrap gap-3 print:hidden">{actions}</div>}
      </div>
      {photo && (
        <Morph name={morphId ? photoName(morphId) : undefined}>
          <div className="relative aspect-[3/2] overflow-hidden border border-(--rule-hair) bg-(--panel-bg) lg:aspect-auto print:hidden">
            {/* Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send. */}
            <img
              src={photo.src}
              alt={photo.alt}
              width={1200}
              height={800}
              fetchPriority="high"
              className="photo-turn absolute inset-0 size-full object-cover [filter:var(--photo-filter)]"
            />
          </div>
        </Morph>
      )}
    </header>
  );
}
