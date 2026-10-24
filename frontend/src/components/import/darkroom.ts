// Pure logic for the darkroom import: what the draft says about its own uncertainty, and the timing of the reveal.
// `confidence` and `regions` are NOT returned by the API yet (docs/API.md, "Draft confidence and regions"); the
// generated types lack them, so they are read defensively from whatever object arrives. Never invented.

/** Rows scoring below this are flagged for a second look. */
export const LOW_CONFIDENCE = 0.6;
/** Gap between ingredient rows arriving (`--stagger-step` in docs/UI.md). */
export const STAGGER_MS = 120;
/** Rows past this slide in together with the last staggered one, so a long list does not take seconds to arrive. */
export const STAGGER_ROWS = 12;

export type Confidence = { title?: number; ingredients?: number[] };
/** A box on a photo, as fractions (0 to 1) of its width and height. `photo` is the index in upload order (default 0). */
export type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
  photo?: number;
  label?: string;
};

const isScore = (v: unknown): v is number =>
  typeof v === "number" && v >= 0 && v <= 1;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function readConfidence(draft: unknown): Confidence {
  const raw =
    isObject(draft) && isObject(draft.confidence) ? draft.confidence : {};
  const out: Confidence = {};
  if (isScore(raw.title)) out.title = raw.title;
  if (Array.isArray(raw.ingredients))
    out.ingredients = raw.ingredients.map((v) => (isScore(v) ? v : NaN));
  return out;
}

export function readRegions(draft: unknown): Region[] {
  const raw =
    isObject(draft) && Array.isArray(draft.regions) ? draft.regions : [];
  return raw.flatMap((r): Region[] => {
    if (
      !isObject(r) ||
      !isScore(r.x) ||
      !isScore(r.y) ||
      !isScore(r.w) ||
      !isScore(r.h) ||
      r.w <= 0 ||
      r.h <= 0 ||
      r.x + r.w > 1.001 ||
      r.y + r.h > 1.001
    )
      return [];
    return [
      {
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        photo: Number.isInteger(r.photo) && (r.photo as number) >= 0 ? (r.photo as number) : 0,
        label: typeof r.label === "string" ? r.label : undefined,
      },
    ];
  });
}

/** One flag per row: true when its score is present and low. Missing or invalid scores never flag. */
export const flaggedRows = (
  scores: number[] | undefined,
  rows: number,
): boolean[] =>
  Array.from({ length: rows }, (_, i) => (scores?.[i] ?? 1) < LOW_CONFIDENCE);

export const staggerDelays = (rows: number, step = STAGGER_MS): number[] =>
  Array.from({ length: rows }, (_, i) => Math.min(i, STAGGER_ROWS) * step);

/** The card shown where a photo would be for a link import: site name and host, never a favicon fetch. */
export function hostCard(
  address: string,
  sourceName?: string | null,
): { name: string; host: string } | null {
  try {
    const host = new URL(address).hostname.replace(/^www\./, "");
    return host ? { name: sourceName?.trim() || host, host } : null;
  } catch {
    return null;
  }
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
