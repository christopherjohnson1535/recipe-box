"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { CookTimer, CookTimers } from "@/components/ui/CookKit";
import { formatClock, rackOrder, remainingMs, ringFraction, type Timer } from "@/lib/timers";
import { FLASH_MS } from "./use-cook-timers";

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribe = (change: () => void) => {
  const media = window.matchMedia?.(REDUCE);
  media?.addEventListener?.("change", change);
  return () => media?.removeEventListener?.("change", change);
};
/** True when the person asked for reduced motion; the server render says no. */
const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia?.(REDUCE).matches ?? false, () => false);

/**
 * The timer column: a ring for the first three, compact rows after; a finished timer comes first, so it is never scrolled
 * out of sight, then the rest by time left (see `rackOrder`: Pause and Resume never move a timer). A finished timer blinks
 * the accent for ten seconds, then holds it; with reduced motion it holds it at once. When focus is on a control of a timer
 * and the cook presses Pause, Resume or +1 min, the same control of the same timer has focus afterwards, even if +1 min moved it.
 */
export function CookTimerRack({
  timers,
  now,
  onDismiss,
  onPause,
  onResume,
  onAddMinute,
}: {
  timers: Timer[];
  now: number;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onAddMinute: (id: number) => void;
}) {
  const still = useReducedMotion();
  const phase = Math.floor(now / 600) % 2 === 0;
  const refocus = useRef<{ id: number; control: string } | null>(null);
  // Moving a timer in the list can drop focus: put it back on the control that had it (runs after every render, cheap).
  useLayoutEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    const control = document.querySelector<HTMLElement>(`[data-timer-id="${want.id}"] [data-control="${want.control}"]`);
    control?.focus();
  });
  /** Runs `act`, first noting the control that has focus if it belongs to timer `id`. */
  const keepFocus = (id: number, act: (id: number) => void) => () => {
    const focused = document.activeElement;
    const control = focused instanceof HTMLElement && focused.closest("[data-timer-id]")?.getAttribute("data-timer-id") === String(id) ? focused.dataset.control : undefined;
    refocus.current = control ? { id, control } : null;
    act(id);
  };
  return (
    <CookTimers empty="Tap a time in the step to start a timer.">
      {rackOrder(timers, now).map((t, i) => (
        <CookTimer
          key={t.id}
          timerId={t.id}
          label={t.label}
          digits={formatClock(remainingMs(t, now))}
          fraction={ringFraction(t, now)}
          done={t.done}
          flash={still || (t.done && now - t.endsAt >= FLASH_MS) ? true : phase}
          large={i < 3}
          small={i > 0}
          paused={t.pausedLeftMs !== null}
          onDismiss={() => onDismiss(t.id)}
          onTogglePause={keepFocus(t.id, t.pausedLeftMs === null ? onPause : onResume)}
          onAddMinute={keepFocus(t.id, onAddMinute)}
        />
      ))}
    </CookTimers>
  );
}
