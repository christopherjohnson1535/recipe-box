import { ViewTransition, type ReactNode } from "react";

/** View-transition names that pair a card with the page it opens (and the page's skeleton). */
export const photoName = (id: string) => `recipe-photo-${id}`;
export const titleName = (id: string) => `recipe-title-${id}`;
/** The arrival key of a recipe page (see Arrive). A card that morphs into the page marks it arrived. */
export const recipeArrivalKey = (id: string) => `recipe:${id}`;

// Which recipes the person opened from a card had a photo. The recipe skeleton shows a photo box only for those:
// a direct load knows nothing, and a photo arriving later pushes the page down less than a 576px box collapsing.
const photoSeen = new Map<string, boolean>();
export const rememberPhoto = (id: string, has: boolean) => void photoSeen.set(id, has);
const titleSeen = new Map<string, string>();
/** The skeleton sets the card's own title in the headline's type, so the title morph carries real text, not a tinted bar. */
export const rememberTitle = (id: string, title: string) => void titleSeen.set(id, title);
export const titleFor = (id: string) => titleSeen.get(id);
export const hasPhotoFor = (id: string) => photoSeen.get(id) === true;

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
