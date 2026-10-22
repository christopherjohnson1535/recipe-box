import type { Recipe } from "@/lib/api";

const MINUTE = 60_000;

export type Byline = { verb: "Added" | "Edited"; who: string | null; iso: string };

/**
 * "Added by Sam" then "Edited by Chris" when someone else or a later edit changed it. Pure data: the date is shown by
 * `LocalDate`, in the viewer's own time zone.
 */
export function bylines(r: Pick<Recipe, "createdBy" | "updatedBy" | "createdAt" | "updatedAt">): Byline[] {
  const out: Byline[] = r.createdBy ? [{ verb: "Added", who: r.createdBy.displayName, iso: r.createdAt }] : [];
  const edited =
    r.updatedBy !== null && (r.updatedBy.id !== r.createdBy?.id || Date.parse(r.updatedAt) - Date.parse(r.createdAt) > MINUTE);
  if (edited) out.push({ verb: "Edited", who: r.updatedBy?.displayName ?? null, iso: r.updatedAt });
  return out;
}
