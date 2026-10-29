import { NUMBER } from "./scale";

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

// A bare number or range with no words: "4", "4-6", "4–6", "4 to 6", "1/2", "1½". "4 cups" and "12 bars" are not.
const BARE_SERVINGS = new RegExp(`^(?:${NUMBER})(?:(?:\\s*[-–]\\s*|\\s+to\\s+)(?:${NUMBER}))?$`, "i");

/** "Serves 4" for a bare number or range only; anything with words ("4 cups", "makes 12 cookies") as written, trimmed; null when empty. */
export function servingsLabel(servings: string | null | undefined): string | null {
  const s = servings?.trim();
  if (!s) return null;
  return BARE_SERVINGS.test(s.replace("\u2044", "/")) ? `Serves ${s}` : s;
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

/** Curly apostrophes for display: "Grandma's" → "Grandma’s". Never use it on text that is matched or stored. */
export function typographic(text: string): string {
  return text.replace(/(\p{L})'(\p{L})/gu, "$1\u2019$2");
}
