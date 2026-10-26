import { IngredientMention, TimerChip } from "@/components/ui/Method";
import { annotateStep } from "./mentions";

// Punctuation that closes a phrase: it stays on the line its timer pill is on instead of wrapping alone to the next.
const CLOSING = /^[,.;:!?)\]”’"»…]+/;

/** A step's text with its durations set as timer chips and the ingredients it names linked to their rows. */
export function StepText({ text, ingredients }: { text: string; ingredients: string[] }) {
  const parts = annotateStep(text, ingredients);
  return parts.map((part, i) => {
    if (part.kind === "timer") {
      const next = parts[i + 1];
      return <TimerChip key={i} after={next?.kind === "text" ? next.text.match(CLOSING)?.[0] : undefined}>{part.text}</TimerChip>;
    }
    if (part.kind === "ingredient") return <IngredientMention key={i} index={part.ingredient}>{part.text}</IngredientMention>;
    if (part.kind === "text" && i > 0 && parts[i - 1].kind === "timer") return part.text.replace(CLOSING, "");
    return part.text;
  });
}
