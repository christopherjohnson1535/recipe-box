"use client";

import { useSyncExternalStore } from "react";
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
 * out of sight, and paused ones come last. A finished timer blinks the accent for ten seconds, then holds it; with reduced motion it holds it at once.
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
  return (
    <CookTimers empty="Tap a time in the step to start a timer.">
      {rackOrder(timers).map((t, i) => (
        <CookTimer
          key={t.id}
          label={t.label}
          digits={formatClock(remainingMs(t, now))}
          fraction={ringFraction(t, now)}
          done={t.done}
          flash={still || (t.done && now - t.endsAt >= FLASH_MS) ? true : phase}
          large={i < 3}
          small={i > 0}
          paused={t.pausedLeftMs !== null}
          onDismiss={() => onDismiss(t.id)}
          onTogglePause={() => (t.pausedLeftMs === null ? onPause(t.id) : onResume(t.id))}
          onAddMinute={() => onAddMinute(t.id)}
        />
      ))}
    </CookTimers>
  );
}
