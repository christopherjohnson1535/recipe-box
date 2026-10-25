import type { ReactNode } from "react";
import { splitIngredient } from "@/lib/scale";
import { cx } from "./cx";

// Import as a darkroom (#42). The semantic token `attention` (sea teal) is only ever a wash, a rule or a mark (2.1:1 on
// day paper); any glyph on it is `on-attention` ink. The dark ground is `stage`. tokens.test.ts checks the contrast.
// Movement lives in these keyframes and is switched off for reduced motion.
const css = `
@keyframes dr-scan{from{top:4%}to{top:94%}}
@keyframes dr-slide{from{opacity:0;translate:-1rem 0}to{opacity:1;translate:0 0}}
.dr-line{top:50%}
.dr-row{animation:dr-slide var(--duration-base) var(--ease-out) both}
@media (prefers-reduced-motion:no-preference){
.dr-line{animation:dr-scan 1.8s var(--ease-out) infinite alternate}
}
@media (prefers-reduced-motion:reduce){.dr-row{animation:none}}
`;
const Styles = () => (
  <style href="darkroom" precedence="default">
    {css}
  </style>
);

export type StageRegion = { x: number; y: number; w: number; h: number; label?: string };

/** A photo tilted on a dark ground. `scanning` loops an attention-coloured line over it; regions are boxes the provider found. */
export function ScanStage({ src, alt, caption, scanning, regions = [] }: { src: string; alt: string; caption: string; scanning: boolean; regions?: StageRegion[] }) {
  return (
    <figure className="flex flex-col gap-3 bg-stage p-6 text-on-stage">
      <Styles />
      <div className="relative mx-auto w-3/5 -rotate-2 overflow-hidden sm:w-1/2 lg:w-4/5">
        <img src={src} alt={alt} className="block w-full" />
        {regions.map((r, i) => (
          <div
            key={i}
            data-testid="region"
            title={r.label}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            className="absolute border-2 border-attention shadow-[0_0_0_1px_var(--color-stage),inset_0_0_0_1px_var(--color-stage)]"
          />
        ))}
        {scanning && <div data-testid="scan-line" aria-hidden="true" className="dr-line absolute inset-x-0 h-0.5 bg-attention" />}
      </div>
      <figcaption className="label flex items-center justify-center gap-2">
        {scanning && <span aria-hidden="true" className="size-2 rounded-full bg-attention motion-safe:animate-pulse" />}
        {caption}
      </figcaption>
    </figure>
  );
}

/** Link imports have no photo: the site's name and host on the same dark ground. */
export function DomainCard({ name, host }: { name: string; host: string }) {
  return (
    <div className="flex min-h-48 flex-col bg-stage text-on-stage justify-center gap-2 p-8">
      <p className="label">From the web</p>
      <p className="font-display text-title">{name}</p>
      <p className="text-small italic">{host}</p>
    </div>
  );
}

/** The draft as it fills in: a list of rows that slide in one after another. */
export function DraftList({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col border-t border-rule">
      <Styles />
      {children}
    </ul>
  );
}

/** The heading over the photo while it is read: a display line and an italic one. Hidden from screen readers: the Pending box beside it is the live status. */
export function ScanHeading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <p className="font-display text-title text-ink lg:text-[2.75rem] lg:leading-[1.1]">Reading your page</p>
      <p className="text-deck italic text-ink-muted">
        Hold tight…
      </p>
    </div>
  );
}

/** "Draft · not saved yet": the accent kicker over the title. */
export function DraftKicker({ children }: { children: ReactNode }) {
  return <p className="label text-(--kicker-fg)">{children}</p>;
}

/** The draft's title at display size. Screen readers get all of it; sighted readers watch it type in (space reserved). */
export function DraftTitle({ title, typed }: { title: string; typed: string }) {
  return (
    <h3 className="font-display text-title text-ink [overflow-wrap:anywhere] sm:text-[2.75rem] sm:leading-[1.1]">
      <span className="sr-only">{title}</span>
      <span aria-hidden="true">
        {typed}
        <span className="invisible">{title.slice(typed.length)}</span>
      </span>
    </h3>
  );
}

/**
 * One row: a mark at the left (check, or a `?` ink-on-attention badge when flagged), the quantity in accent tabular
 * figures, then the rest of the line. Flagged rows get the attention wash; `delay` staggers the slide in.
 */
export function DraftRow({ delay, flagged, text }: { delay: number; flagged: boolean; text: string }) {
  const { quantity, rest } = splitIngredient(text);
  return (
    <li
      data-flagged={flagged ? "true" : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cx(flagged && "bg-attention/20", "dr-row flex min-h-control items-baseline gap-4 border-b border-rule px-2 py-2 text-body")}
    >
      {flagged ? (
        <span role="img" aria-label="Low confidence: check this against your page" className="label inline-flex size-7 shrink-0 translate-y-1 items-center justify-center bg-attention text-on-attention">
          ?
        </span>
      ) : (
        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center text-ink-muted">
          ✓
        </span>
      )}
      <span className="w-24 shrink-0 font-semibold tabular-nums text-(--qty-fg)">{quantity}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{rest}</span>
    </li>
  );
}

/** The attention-ruled note for warnings. */
export function DraftNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="border-l-[3px] border-attention bg-(--alert-bg) px-5 py-4 text-small text-(--alert-fg)">
      <p className="label">Check these before saving</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
