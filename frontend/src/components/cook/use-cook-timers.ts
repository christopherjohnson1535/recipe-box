"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { noTimers, timerReducer } from "./cook-logic";

export const FLASH_MS = 10_000;

/** "Step 2 · 12 min": short enough for the ring. Cooking together the dish goes first: "Salad · Step 2 · 12 min". */
export const timerLabel = (step: number, text: string, dish?: string) =>
  `${dish ? `${dish} · ` : ""}Step ${step} · ${text.replace(/\s*minutes?\b/i, " min").replace(/\s*hours?\b/i, " hr")}`;

/**
 * The timers of a cook session: they live above the step view, so they keep running when the step (or dish) changes. Ticks
 * twice a second while one runs, keeps re-rendering while a finished one flashes, and announces and chimes once per finished timer.
 */
export function useCookTimers(announce: (text: string) => void, chime: () => void) {
  const [state, dispatch] = useReducer(timerReducer, noTimers);
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef(new Set<number>());
  const { timers } = state;

  const running = timers.some((t) => !t.done);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 500);
    return () => clearInterval(tick);
  }, [running]);

  // A finished timer flashes for ten seconds, then stays accent; the re-render stops with the flashing.
  const flashing = timers.some((t) => t.done && now - t.endsAt < FLASH_MS);
  useEffect(() => {
    if (!flashing) return;
    const flip = setInterval(() => setNow(Date.now()), 600);
    return () => clearInterval(flip);
  }, [flashing]);

  useEffect(() => {
    const fresh = timers.filter((t) => t.done && !announced.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) announced.current.add(t.id);
    // Announcing and chiming are side effects of a timer finishing, not derived state.
    announce(`Timer finished: ${fresh.map((t) => t.label).join(", ")}`);
    chime();
  }, [timers, announce, chime]);

  const start = useCallback(
    (label: string, seconds: number) => {
      const t = Date.now();
      // A double tap on the chip is one timer.
      if (timers.some((x) => x.label === label && x.totalMs === seconds * 1000 && t - (x.endsAt - x.totalMs) < 1500)) return;
      setNow(t);
      dispatch({ type: "start", label, seconds, now: t });
    },
    [timers],
  );
  const dismiss = useCallback((id: number) => dispatch({ type: "dismiss", id }), []);
  return { timers, now, running, start, dismiss };
}
