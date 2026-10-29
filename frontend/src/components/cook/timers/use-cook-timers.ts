"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isRunning, noTimers, timerReducer } from "@/lib/timers";
import { useTimerAlert } from "./use-timer-alert";

/** A finished timer flashes (and rings) this long, then stays accent until dismissed. */
export const FLASH_MS = 10_000;

/**
 * The timers of a cook session: they live above the step view, so they keep running when the step, dish or view changes.
 * Ticks twice a second while one runs (a paused one does not), keeps re-rendering while a finished one flashes, and
 * announces and rings each time a timer finishes (again if +1 minute sets it going and it finishes again).
 * `start(key, label, seconds)`: `key` names the chip (dish, step, place in the step), so a second tap on a running or
 * paused chip is not a second timer. `pause`, `resume` and `addMinute` take the timer's id. The returned `alert` has
 * the mute switch's state.
 */
export function useCookTimers(announce: (text: string) => void) {
  const [state, dispatch] = useReducer(timerReducer, noTimers);
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef(new Set<number>());
  const alert = useTimerAlert();
  const { ring, stop } = alert;
  const { timers } = state;

  const running = timers.some(isRunning);
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
    // A timer that is no longer finished (+1 minute) is forgotten, so finishing again is announced again.
    for (const id of announced.current) if (!timers.some((t) => t.id === id && t.done)) announced.current.delete(id);
    const fresh = timers.filter((t) => t.done && !announced.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) announced.current.add(t.id);
    // Announcing and ringing are side effects of a timer finishing, not derived state.
    announce(`Timer finished: ${fresh.map((t) => t.label).join(", ")}`);
    ring();
  }, [timers, announce, ring]);

  const start = useCallback(
    (key: string, label: string, seconds: number) => {
      const t = Date.now();
      // Restarting the only finished timer replaces it: its ring ends with it, as on Dismiss.
      if (timers.some((x) => x.key === key && x.done) && !timers.some((x) => x.done && x.key !== key)) stop();
      setNow(t);
      dispatch({ type: "start", key, label, seconds, now: t });
    },
    [timers, stop],
  );
  const dismiss = useCallback(
    (id: number) => {
      // Dismissing the last finished timer quiets the ring; one still running carries on.
      if (!timers.some((t) => t.done && t.id !== id)) stop();
      dispatch({ type: "dismiss", id });
    },
    [timers, stop],
  );
  const pause = useCallback((id: number) => {
    const t = Date.now();
    setNow(t);
    dispatch({ type: "pause", id, now: t });
  }, []);
  const resume = useCallback((id: number) => {
    const t = Date.now();
    setNow(t);
    dispatch({ type: "resume", id, now: t });
  }, []);
  const addMinute = useCallback(
    (id: number) => {
      const t = Date.now();
      // +1 minute on the only finished timer sets it going again: its ring ends, as on Dismiss.
      if (timers.some((x) => x.id === id && x.done) && !timers.some((x) => x.done && x.id !== id)) stop();
      const timer = timers.find((x) => x.id === id);
      if (timer) announce(`Added a minute: ${timer.label}`);
      setNow(t);
      dispatch({ type: "addMinute", id, now: t });
    },
    [timers, stop, announce],
  );
  return { timers, now, running, start, dismiss, pause, resume, addMinute, alert };
}
