import { splitDurations } from "@/lib/recipe";
import { annotateStep, ingredientNames, type StepPart } from "@/components/recipe-page/mentions";

// Not a name on its own when it is the first word of a two-word name ("dry red wine", "olive oil", "garlic cloves").
const NOT_A_NAME = new Set(
  "cups cup tbsp tsp ounce ounces pound pounds clove cloves sprig sprigs pinch bunch can cans canned olive sesame black white red green brown yellow sweet sour dark light plain heavy double single baking cooking kosher sea table crushed low full all-purpose".split(
    " ",
  ),
);

/**
 * Like annotateStep, plus the first word of a two-word name when the step uses just that ("4 garlic cloves, smashed" is
 * "garlic" in the step). Each such ingredient is linked once, and only if the step did not already name it.
 * shortcut: recipe-page/mentions.ts has the same gap; a follow-up could move this there.
 */
export function cookParts(step: string, lines: string[]): StepPart[] {
  const parts = annotateStep(step, lines);
  const named = new Set(parts.flatMap((p) => (p.kind === "ingredient" ? [p.ingredient] : [])));
  const extra = new Map<string, number>();
  lines.forEach((line, i) => {
    const words = (ingredientNames(line)[0] ?? "").split(" ");
    const first = words[0];
    if (!named.has(i) && words.length === 2 && first.length >= 4 && !NOT_A_NAME.has(first) && !extra.has(first)) extra.set(first, i);
  });
  if (extra.size === 0) return parts;
  const used = new Set<number>();
  return parts.flatMap((part): StepPart[] => {
    if (part.kind !== "text") return [part];
    const out: StepPart[] = [];
    let rest = part.text;
    for (;;) {
      let best: { at: number; len: number; ingredient: number } | null = null;
      for (const [word, ingredient] of extra) {
        if (used.has(ingredient)) continue;
        const m = new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "iu").exec(rest);
        if (m && (!best || m.index < best.at)) best = { at: m.index, len: m[0].length, ingredient };
      }
      if (!best) break;
      used.add(best.ingredient);
      if (best.at > 0) out.push({ kind: "text", text: rest.slice(0, best.at) });
      out.push({ kind: "ingredient", text: rest.slice(best.at, best.at + best.len), ingredient: best.ingredient });
      rest = rest.slice(best.at + best.len);
    }
    if (rest) out.push({ kind: "text", text: rest });
    return out;
  });
}

/** Indexes of the ingredient lines the step names (the "lit" rows in the cook-mode rail). */
export function litIngredients(step: string, lines: string[]): Set<number> {
  return new Set(cookParts(step, lines).flatMap((p) => (p.kind === "ingredient" ? [p.ingredient] : [])));
}

/** Rail order: lit ingredients first, then the rest, each in recipe order. */
export function railOrder(count: number, lit: Set<number>): { index: number; lit: boolean }[] {
  const all = Array.from({ length: count }, (_, index) => ({ index, lit: lit.has(index) }));
  return [...all.filter((r) => r.lit), ...all.filter((r) => !r.lit)];
}

/** The durations written in a step, as timers that could be started from it. */
export function stepDurations(step: string): { label: string; seconds: number }[] {
  return splitDurations(step).flatMap((s) => (s.minutes === null ? [] : [{ label: s.text, seconds: Math.max(1, Math.round(s.minutes * 60)) }]));
}

export const SWIPE_MIN_PX = 60;

/** A swipe moves the step when it is mostly horizontal and long enough: left goes forward, right goes back. */
export function swipeDirection(dx: number, dy: number): "next" | "back" | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "back";
}

export const clampStep = (i: number, count: number) => Math.min(Math.max(i, 0), Math.max(count - 1, 0));

export type CookTimer = { id: number; label: string; totalMs: number; endsAt: number; done: boolean };
export type TimerAction =
  | { type: "start"; label: string; seconds: number; now: number }
  | { type: "tick"; now: number }
  | { type: "dismiss"; id: number };
export type TimerState = { nextId: number; timers: CookTimer[] };
export const noTimers: TimerState = { nextId: 1, timers: [] };

/** Timers hold an end time, not a countdown, so they stay right when the page is throttled or the tab sleeps. */
export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "start": {
      const totalMs = action.seconds * 1000;
      return {
        nextId: state.nextId + 1,
        timers: [...state.timers, { id: state.nextId, label: action.label, totalMs, endsAt: action.now + totalMs, done: false }],
      };
    }
    case "tick": {
      if (!state.timers.some((t) => !t.done && t.endsAt <= action.now)) return state;
      return { ...state, timers: state.timers.map((t) => (!t.done && t.endsAt <= action.now ? { ...t, done: true } : t)) };
    }
    case "dismiss":
      return { ...state, timers: state.timers.filter((t) => t.id !== action.id) };
  }
}

export const remainingMs = (t: CookTimer, now: number) => (t.done ? 0 : Math.max(0, t.endsAt - now));
/** 0 to 1: how much of the ring is left. */
export const ringFraction = (t: CookTimer, now: number) => (t.totalMs > 0 ? remainingMs(t, now) / t.totalMs : 0);

/** "8:38", or "1:05:00" from an hour up; rounds up so a running timer never shows 0:00. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const FILLER = new Set(["please", "go", "okay", "ok", "that", "again", "hey"]);

/** What a spoken phrase asks for, or null. */
export function parseVoice(transcript: string): "next" | "back" | "repeat" | null {
  const words = (transcript.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !FILLER.has(w));
  // Only a short command, so "put the lid back" in kitchen talk never moves the step.
  if (words.length === 0 || words.length > 2) return null;
  const phrase = words.join(" ");
  if (phrase === "next" || phrase === "next step") return "next";
  if (phrase === "back" || phrase === "previous" || phrase === "previous step" || phrase === "back step") return "back";
  if (phrase === "repeat" || phrase === "repeat step") return "repeat";
  return null;
}

/** Ticks (ingredients and steps) for one recipe; a new cooking session starts clean after this long without a change. */
export const TICKS_TTL_MS = 12 * 60 * 60 * 1000;
export type Ticks = { ingredients: ReadonlySet<number>; steps: ReadonlySet<number> };
export const noTicks: Ticks = { ingredients: new Set(), steps: new Set() };

function parseTicksObject(raw: string | null): Record<string, unknown> | null {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (typeof data !== "object" || data === null) return null;
    const d = data as Record<string, unknown>;
    return d.v === 1 && typeof d.at === "number" ? d : null;
  } catch {
    return null;
  }
}

/** True when the stored text is not usable ticks (corrupt, another version) or was last changed 12 hours ago or more. */
export function ticksStale(raw: string | null, now: number): boolean {
  const d = parseTicksObject(raw);
  return !d || now - (d.at as number) >= TICKS_TTL_MS;
}

/** Stored ticks, or none for corrupt text. Indexes outside the recipe (it was edited since) are dropped. */
export function parseTicks(raw: string | null, counts: { ingredients: number; steps: number }): Ticks {
  const d = parseTicksObject(raw);
  if (!d) return noTicks;
  const keep = (list: unknown, count: number) =>
    new Set(Array.isArray(list) ? list.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < count) : []);
  return { ingredients: keep(d.ingredients, counts.ingredients), steps: keep(d.steps, counts.steps) };
}

export const serialiseTicks = (t: Ticks, now: number) =>
  JSON.stringify({ v: 1, at: now, ingredients: [...t.ingredients].sort((a, b) => a - b), steps: [...t.steps].sort((a, b) => a - b) });

export function toggled(set: ReadonlySet<number>, i: number): Set<number> {
  const next = new Set(set);
  if (!next.delete(i)) next.add(i);
  return next;
}
