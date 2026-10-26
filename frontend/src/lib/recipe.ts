import { NUMBER, parseNumber, splitIngredient } from "./scale";

/** The picture to show on cards, the cover and the recipe page: the print-treated rendition when there is one, else the original. */
export function plateSrc(r: { imageUrl: string | null; imageDisplayUrl?: string | null }): string | null {
  return r.imageDisplayUrl ?? r.imageUrl;
}

/** 75 → "1 hr 15 min". */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
}

/** "Serves 4" for a bare number or range; a phrase ("makes about 4 bowls") as written; null when empty. */
export function servingsLabel(servings: string | null | undefined): string | null {
  const s = servings?.trim();
  if (!s) return null;
  return splitIngredient(s).quantity === s ? `Serves ${s}` : s;
}

/** Consecutive items with the same `section` become one group (REC-3 headings). */
export function groupBySection<T extends { section: string | null }>(items: T[]): { section: string | null; items: T[] }[] {
  const groups: { section: string | null; items: T[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

/** Big-numeral form of a time for the numerals band: 20 → 20 min, 180 → 3 hr, 200 → 3 hr + 20 min (set side by side). */
export function minuteNumeral(minutes: number | null | undefined): { value: string; unit: "min" | "hr" }[] | null {
  if (minutes == null || minutes <= 0) return null;
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return [...(h ? [{ value: String(h), unit: "hr" as const }] : []), ...(m ? [{ value: String(m), unit: "min" as const }] : [])];
}

/** A stretch of step text: plain (`minutes` null) or a duration ("12 minutes"), which the page sets as a timer chip. */
export type DurationSegment = { text: string; minutes: number | null };

const UNITS = "(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)";
// "1 hour 30 minutes", "1½ hours", "10-12 minutes", "2 to 3 hours", "45 seconds". "350°F" and "2 cups" have no time unit.
const DURATION = new RegExp(
  `(?<![\\w.])(${NUMBER})(?:(?:\\s*[-–]\\s*|\\s+to\\s+)(${NUMBER}))?\\s*(${UNITS})\\b(?:\\s*(?:and\\s+)?(${NUMBER})\\s*(minutes?|mins?)\\b)?`,
  "gi",
);
const PER_MINUTE = { h: 60, m: 1, s: 1 / 60 } as const;
const unitOf = (u: string) => u[0].toLowerCase() as keyof typeof PER_MINUTE;

/**
 * Cuts step text into plain text and durations, in order, so the page can set the durations as timer chips (and
 * #24 can start a timer from one). `minutes` is the lower end of a range, fractions of a minute for seconds.
 */
export function splitDurations(text: string): DurationSegment[] {
  const out: DurationSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(DURATION)) {
    let minutes = parseNumber(m[1]) * PER_MINUTE[unitOf(m[3])];
    if (!m[2] && m[4]) minutes += parseNumber(m[4]);
    if (m.index > last) out.push({ text: text.slice(last, m.index), minutes: null });
    out.push({ text: m[0], minutes });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), minutes: null });
  return out;
}

/** Curly apostrophes for display: "Grandma's" → "Grandma’s". Never use it on text that is matched or stored. */
export function typographic(text: string): string {
  return text.replace(/(\p{L})'(\p{L})/gu, "$1\u2019$2");
}
