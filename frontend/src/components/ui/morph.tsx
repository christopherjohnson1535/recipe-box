import { ViewTransition, type ReactNode } from "react";

/** View-transition names that pair a card with the page it opens (and the page's skeleton). */
export const photoName = (id: string) => `recipe-photo-${id}`;
export const titleName = (id: string) => `recipe-title-${id}`;
/** The arrival key of a recipe page (see Arrive). A card that morphs into the page marks it arrived. */
export const recipeArrivalKey = (id: string) => `recipe:${id}`;

/**
 * Names one element for the card → page morph. Both sides use the same name, `share="morph"` and `default="none"`
 * (the element animates only as one half of a pair, never on unrelated transitions). Without a name it is a no-op,
 * e.g. for a recipe with no photo. Browsers without view transitions just navigate.
 */
export function Morph({ name, children }: { name?: string; children: ReactNode }) {
  if (!name) return <>{children}</>;
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
