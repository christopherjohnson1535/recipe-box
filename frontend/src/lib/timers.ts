// Step timers (KIT-6): finding the durations written in a step, and the state of the timers started from them.
import { NUMBER, parseNumber } from "./scale";

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};
// "twenty-five", "forty five": a ten plus a unit.
const WORD = "(?:(?:twenty|thirty|forty|fifty)[- ](?:one|two|three|four|five|six|seven|eight|nine)|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|twenty|thirty|forty|fifty|sixty|ninety|one|two|three|four|five|six|seven|eight|nine)";
// A number, then optionally "and a half" ("1 and a half hours"). "a"/"an" only count before a unit: "an hour", "a minute".
const AMOUNT = `(?:${NUMBER}|${WORD})(?:\\s+and\\s+a\\s+half)?`;
const RANGE = "(?:\\s*[-–]\\s*|\\s+(?:to|or)\\s+)";
const HOURS = "hours?|hrs?|h";
const MINUTES = "minutes?|mins?";
const SECONDS = "seconds?|secs?";
// One unit with its amount (`<k>` names the groups): the number touches the unit, or a space or a hyphen joins them
// ("10-minute rest"); a range ends at its first number ("10-12 minutes" is 10).
const PART = (k: string, unit: string) => `(?<${k}>${AMOUNT}|an?)(?:${RANGE}(?:${AMOUNT}))?(?:\\s*|-)(?<${k}Unit>${unit})(?![\\w-])`;
// A smaller unit may follow, never as a range: "1 hour 30 minutes", "1 hr and 15 min", "2 minutes 30 seconds".
const TAIL = (k: string, unit: string) => `(?:\\s*(?:and\\s+)?(?<${k}>${AMOUNT})(?:\\s*|-)(?:${unit})(?![\\w-]))?`;
const DURATION = new RegExp(
  [
    "half\\s+an?\\s+(?<half>hour|minute)(?![\\w-])", // "half an hour"
    `${PART("h", HOURS)}(?<hHalf>\\s+and\\s+a\\s+half(?![\\w-]))?${TAIL("hm", MINUTES)}`, // "an hour and a half"
    `${PART("m", MINUTES)}${TAIL("ms", SECONDS)}`,
    PART("s", SECONDS),
  ]
    .map((alt) => `(?<![\\w.])(?:${alt})`)
    .join("|"),
  "gi",
);

/** "2", "1½", "twenty-five", "1 and a half", "an" → seconds per unit times this. */
function amount(text: string): number {
  const t = text.toLowerCase().replace(/\s+and\s+a\s+half$/, "");
  const half = t === text.toLowerCase() ? 0 : 0.5;
  if (t === "a" || t === "an") return 1 + half;
  const words = t.split(/[- ]/);
  if (words.every((w) => w in WORD_NUMBERS)) return words.reduce((sum, w) => sum + WORD_NUMBERS[w], 0) + half;
  return parseNumber(t) + half;
}

/** A stretch of step text: plain (`seconds` null) or a duration ("12 minutes"), which the page sets as a timer chip. */
export type DurationSegment = { text: string; seconds: number | null };

/**
 * Cuts step text into plain text and durations, in order, so cook mode can set each duration as a tap-to-start timer.
 * `seconds` is the lower end of a range ("10-12 minutes" is 600): the cook checks at the earliest time written.
 * "a second" is never a duration ("add a second egg"); "350°F" and "2 cups" have no time unit.
 */
export function splitDurations(text: string): DurationSegment[] {
  const out: DurationSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(DURATION)) {
    const seconds = durationOf(m);
    if (seconds === null) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), seconds: null });
    out.push({ text: m[0], seconds });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), seconds: null });
  // Text skipped over by a rejected match is plain text: merge neighbours so the parts stay one run each.
  return out.reduce<DurationSegment[]>((acc, seg) => {
    const prev = acc.at(-1);
    if (prev && prev.seconds === null && seg.seconds === null) prev.text += seg.text;
    else acc.push({ ...seg });
    return acc;
  }, []);
}

function durationOf(m: RegExpMatchArray): number | null {
  const g = m.groups ?? {};
  if (g.half) return g.half.toLowerCase() === "hour" ? 1800 : 30;
  if (g.hUnit) return Math.round(amount(g.h) * 3600 + (g.hHalf ? 1800 : 0) + (g.hm ? amount(g.hm) * 60 : 0));
  if (g.mUnit) return Math.round(amount(g.m) * 60 + (g.ms ? amount(g.ms) : 0));
  // "a second" is an ordinal ("add a second egg"), never a duration.
  return /^an?$/i.test(g.s) ? null : Math.max(1, Math.round(amount(g.s)));
}

/** The durations written in a step, as timers that could be started from it. */
export const stepDurations = (step: string): { label: string; seconds: number }[] =>
  splitDurations(step).flatMap((s) => (s.seconds === null ? [] : [{ label: s.text, seconds: s.seconds }]));

/** "Step 2 · 12 min": short enough for the ring. Cooking together the dish goes first: "Salad · Step 2 · 12 min". */
export const timerLabel = (step: number, text: string, dish?: string) =>
  `${dish ? `${dish} · ` : ""}Step ${step} · ${text.replace(/\s*minutes?\b/gi, " min").replace(/\s*hours?\b/gi, " hr").replace(/\s*seconds?\b/gi, " sec")}`;

/** A running or finished timer. `key` names the chip it came from (dish, step and place in the step), so a chip has one timer. */
export type Timer = { id: number; key: string; label: string; totalMs: number; endsAt: number; done: boolean };
export type TimerAction =
  | { type: "start"; key: string; label: string; seconds: number; now: number }
  | { type: "tick"; now: number }
  | { type: "dismiss"; id: number };
export type TimerState = { nextId: number; timers: Timer[] };
export const noTimers: TimerState = { nextId: 1, timers: [] };

/**
 * Timers hold an end time, not a countdown, so they stay right when the page is throttled or the tab sleeps. Starting a
 * chip whose timer is running does nothing (a double tap); starting one whose timer finished starts it again.
 */
export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "start": {
      const same = state.timers.find((t) => t.key === action.key);
      if (same && !same.done) return state;
      const totalMs = action.seconds * 1000;
      const timer = { id: state.nextId, key: action.key, label: action.label, totalMs, endsAt: action.now + totalMs, done: false };
      return { nextId: state.nextId + 1, timers: [...state.timers.filter((t) => t !== same), timer] };
    }
    case "tick": {
      if (!state.timers.some((t) => !t.done && t.endsAt <= action.now)) return state;
      return { ...state, timers: state.timers.map((t) => (!t.done && t.endsAt <= action.now ? { ...t, done: true } : t)) };
    }
    case "dismiss":
      return { ...state, timers: state.timers.filter((t) => t.id !== action.id) };
  }
}

export const remainingMs = (t: Timer, now: number) => (t.done ? 0 : Math.max(0, t.endsAt - now));
/** 0 to 1: how much of the ring is left. */
export const ringFraction = (t: Timer, now: number) => (t.totalMs > 0 ? remainingMs(t, now) / t.totalMs : 0);

/** "8:38", or "1:05:00" from an hour up; rounds up so a running timer never shows 0:00. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
