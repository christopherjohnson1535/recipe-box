import { scaleQuantity } from "@/lib/scale";

/** The scales the recipe page offers (IngredientChecklist: ½× / 1× / 2×). The API accepts 0.25-10; those stay steppable. */
export const SCALE_STEPS = [0.5, 1, 2];

/** The next step up (`1`) or down (`-1`) from a scale, or null at the end. A scale between steps (1.5) goes to its neighbour. */
export function stepScale(scale: number, direction: 1 | -1): number | null {
  const eps = 1e-9;
  const found = direction === 1 ? SCALE_STEPS.find((s) => s > scale + eps) : [...SCALE_STEPS].reverse().find((s) => s < scale - eps);
  return found ?? null;
}

/** "½×", "1×", "1½×". */
export const scaleLabel = (scale: number) => `${scaleQuantity("1", scale)}×`;
