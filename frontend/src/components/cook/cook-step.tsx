import type { ReactNode } from "react";
import { CookMention, CookTimerButton } from "@/components/ui/CookKit";
import { formatClock, remainingMs, splitDurations, type Timer } from "@/lib/timers";
import { cookParts } from "./cook-logic";
import { ordinal } from "./cook-together-logic";

const LEADING_PUNCTUATION = /^[.,;:!?)\]]+/;

/** What a step's chips need from the session's timers: start one, and the one each chip already started. */
export type StepTimers = { start: (key: string, text: string, seconds: number, nth?: string) => void; timers: Timer[]; now: number };

/**
 * A step's text with its ingredients marked and each duration a chip. `key` names the step in the session ("r1:2", or
 * the dish and step cooking together); each chip's timer is keyed by it and the chip's place in the step. A chip whose
 * timer is running shows the time left.
 */
export function renderCookStep(step: string, ingredients: string[], key: string, { start, timers, now }: StepTimers): ReactNode {
  const parts = cookParts(step, ingredients);
  const same = (i: number) => parts.filter((p, j) => p.kind === "timer" && p.text.toLowerCase() === parts[i].text.toLowerCase() && j <= i).length;
  const twice = (i: number) => parts.some((p, j) => j !== i && p.kind === "timer" && p.text.toLowerCase() === parts[i].text.toLowerCase());
  return parts.map((part, i) => {
    if (part.kind === "ingredient") return <CookMention key={i}>{part.text}</CookMention>;
    if (part.kind === "timer") {
      const seconds = splitDurations(part.text)[0]?.seconds;
      if (!seconds) return part.text;
      const chip = `${key}:${i}`;
      const running = timers.find((t) => t.key === chip && !t.done);
      const left = running ? formatClock(remainingMs(running, now)) : undefined;
      // Keep the full stop that follows on the chip's line.
      const next = parts[i + 1];
      const after = (next?.kind === "text" && LEADING_PUNCTUATION.exec(next.text)?.[0]) || "";
      return (
        <CookTimerButton
          key={i}
          after={after}
          left={left}
          // A steady name: the countdown is visual (the live region says when it ends).
          aria-label={left ? `Timer running: ${part.text}` : `Start timer: ${part.text}`}
          aria-disabled={left ? true : undefined}
          onClick={() => start(chip, part.text, seconds, twice(i) ? ordinal(same(i)) : undefined)}
        >
          {part.text}
        </CookTimerButton>
      );
    }
    const prev = parts[i - 1];
    return prev?.kind === "timer" && splitDurations(prev.text)[0]?.seconds ? part.text.replace(LEADING_PUNCTUATION, "") : part.text;
  });
}
