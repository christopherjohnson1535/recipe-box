import type { ReactNode } from "react";
import { CookMention, CookTimerButton } from "@/components/ui/CookKit";
import { cookParts, stepDurations } from "./cook-logic";

const LEADING_PUNCTUATION = /^[.,;:!?)\]]+/;

/** A step's text with its ingredients marked and each duration a chip; a tap on a chip calls `onTimer(label text, seconds)`. */
export function renderCookStep(step: string, ingredients: string[], onTimer: (text: string, seconds: number) => void): ReactNode {
  const parts = cookParts(step, ingredients);
  return parts.map((part, i) => {
    if (part.kind === "ingredient") return <CookMention key={i}>{part.text}</CookMention>;
    if (part.kind === "timer") {
      const d = stepDurations(part.text)[0];
      if (!d) return part.text;
      // Keep the full stop that follows on the chip's line.
      const next = parts[i + 1];
      const after = (next?.kind === "text" && LEADING_PUNCTUATION.exec(next.text)?.[0]) || "";
      return (
        <CookTimerButton key={i} after={after} aria-label={`Start timer: ${part.text}`} onClick={() => onTimer(d.label, d.seconds)}>
          {part.text}
        </CookTimerButton>
      );
    }
    const prev = parts[i - 1];
    return prev?.kind === "timer" && stepDurations(prev.text)[0] ? part.text.replace(LEADING_PUNCTUATION, "") : part.text;
  });
}
