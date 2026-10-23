import { IngredientMention, TimerChip } from "@/components/ui/Method";
import { annotateStep } from "./mentions";

/** A step's text with its durations set as timer chips and the ingredients it names linked to their rows. */
export function StepText({ text, ingredients }: { text: string; ingredients: string[] }) {
  return annotateStep(text, ingredients).map((part, i) => {
    if (part.kind === "timer") return <TimerChip key={i} label={part.label}>{part.text}</TimerChip>;
    if (part.kind === "ingredient") return <IngredientMention key={i} index={part.ingredient}>{part.text}</IngredientMention>;
    return part.text;
  });
}
