import type { ReactNode } from "react";
import { cx } from "./cx";

// Import as a darkroom (#42). Mustard is only ever a background or a rule here (2.17:1 on day paper); any glyph
// drawn on it is ink (about 8:1). Movement lives in these keyframes and is switched off for reduced motion.
// No semantic token names mustard yet (docs/UI.md, "Print inks"), so its value is written here, in one place, as plain
// classes. Darkroom.test.tsx checks the contrast of everything laid on it. No custom properties: the token guard only
// knows the theme's.
const css = `
@keyframes dr-scan{from{top:4%}to{top:94%}}
@keyframes dr-slide{from{opacity:0;translate:-1rem 0}to{opacity:1;translate:0 0}}
.dr-ground{background:#241f19;color:#efe8da}
.dr-region{border:2px solid #d9a21b}
.dr-line{top:50%;background:#d9a21b}
.dr-wash{background-color:color-mix(in srgb,#d9a21b 28%,transparent)}
.dr-badge{background:#d9a21b;color:#1a1714}
.dr-note{border-left-color:#d9a21b}
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

/** A photo tilted on a dark ground. `scanning` loops a mustard line over it; regions are boxes the provider found. */
export function ScanStage({ src, alt, caption, scanning, regions = [] }: { src: string; alt: string; caption: string; scanning: boolean; regions?: StageRegion[] }) {
  return (
    <figure className="dr-ground flex flex-col gap-3 p-6">
      <Styles />
      <div className="relative mx-auto w-4/5 -rotate-2 overflow-hidden">
        <img src={src} alt={alt} className="block w-full" />
        {regions.map((r, i) => (
          <div
            key={i}
            data-testid="region"
            title={r.label}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            className="dr-region absolute"
          />
        ))}
        {scanning && <div data-testid="scan-line" aria-hidden="true" className="dr-line absolute inset-x-0 h-0.5" />}
      </div>
      <figcaption className="label text-center">{caption}</figcaption>
    </figure>
  );
}

/** Link imports have no photo: the site's name and host on the same dark ground. */
export function DomainCard({ name, host }: { name: string; host: string }) {
  return (
    <div className="dr-ground flex min-h-48 flex-col justify-center gap-2 p-8">
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

/** One row. Flagged rows get the mustard wash and a `?` badge (ink on mustard); `delay` staggers the slide in. */
export function DraftRow({ delay, flagged, children }: { delay: number; flagged: boolean; children: ReactNode }) {
  return (
    <li
      data-flagged={flagged ? "true" : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cx(flagged && "dr-wash", "dr-row flex min-h-control items-center gap-3 border-b border-rule px-2 py-2 text-body")}
    >
      <span className="flex-1">{children}</span>
      {flagged && (
        <span role="img" aria-label="Low confidence: check this against your page" className="dr-badge label inline-flex size-7 shrink-0 items-center justify-center">
          ?
        </span>
      )}
    </li>
  );
}

/** The mustard-ruled note for warnings. */
export function DraftNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="dr-note border-l-[3px] bg-(--alert-bg) px-5 py-4 text-small text-(--alert-fg)">
      <p className="label">Check these before saving</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
