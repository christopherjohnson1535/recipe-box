import { formatNumber, NUMBER, parseNumber } from "./scale";

/** 75 → "1 hr 15 min". */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
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

/** Big-numeral form of a time for the numerals band: 20 → 20 "min", 180 → 3 "hr", 200 → 3:20 "hr". */
export function minuteNumeral(minutes: number | null | undefined): { value: string; unit: "min" | "hr" } | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return { value: String(minutes), unit: "min" };
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return { value: m ? `${h}:${String(m).padStart(2, "0")}` : String(h), unit: "hr" };
}

/** A stretch of step text: plain (`minutes` null) or a duration ("12 minutes") with a compact `label` ("12 min"). */
export type DurationSegment = { text: string; minutes: number | null; label: string | null };

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
    const per = PER_MINUTE[unitOf(m[3])];
    const lo = parseNumber(m[1]) * per;
    let minutes = lo;
    let label: string;
    if (m[2]) {
      label = `${formatNumber(parseNumber(m[1]))}–${formatNumber(parseNumber(m[2]))} ${unitOf(m[3]) === "h" ? "hr" : unitOf(m[3]) === "s" ? "sec" : "min"}`;
    } else {
      if (m[4]) minutes += parseNumber(m[4]);
      label = unitOf(m[3]) === "s" ? `${formatNumber(lo * 60)} sec` : (formatMinutes(Math.round(minutes)) ?? "");
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index), minutes: null, label: null });
    out.push({ text: m[0], minutes, label });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), minutes: null, label: null });
  return out;
}
