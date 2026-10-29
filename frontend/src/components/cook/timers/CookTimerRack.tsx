import { CookTimer, CookTimers } from "@/components/ui/CookKit";
import { formatClock, remainingMs, ringFraction, type Timer } from "@/lib/timers";
import { FLASH_MS } from "./use-cook-timers";

/** The timer column: a ring for the first three, compact rows after. */
export function CookTimerRack({ timers, now, onDismiss }: { timers: Timer[]; now: number; onDismiss: (id: number) => void }) {
  const phase = Math.floor(now / 600) % 2 === 0;
  return (
    <CookTimers empty="Tap a time in the step to start a timer.">
      {timers.map((t, i) => (
        <CookTimer
          key={t.id}
          label={t.label}
          digits={formatClock(remainingMs(t, now))}
          fraction={ringFraction(t, now)}
          done={t.done}
          flash={t.done && now - t.endsAt >= FLASH_MS ? true : phase}
          large={i < 3}
          small={i > 0}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </CookTimers>
  );
}
