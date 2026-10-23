import { splitDurations } from "@/lib/recipe";
import { annotateStep } from "@/components/recipe-page/mentions";

/** Indexes of the ingredient lines the step names (the "lit" rows in the cook-mode rail). */
export function litIngredients(step: string, lines: string[]): Set<number> {
  return new Set(annotateStep(step, lines).flatMap((p) => (p.kind === "ingredient" ? [p.ingredient] : [])));
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

/** What a spoken phrase asks for, or null. */
export function parseVoice(transcript: string): "next" | "back" | "repeat" | null {
  const words = transcript.toLowerCase().match(/[a-z]+/g) ?? [];
  const last = words.slice(-3);
  for (let i = last.length - 1; i >= 0; i--) {
    const w = last[i];
    if (w === "next") return "next";
    if (w === "back" || w === "previous") return "back";
    if (w === "repeat") return "repeat";
  }
  return null;
}
