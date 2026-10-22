import type { Recipe } from "@/lib/api";

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const MINUTE = 60_000;

/** "Added by Sam on Oct 21, 2026", then "Edited by Chris on Oct 22, 2026" when someone else or a later edit changed it. */
export function bylines(r: Pick<Recipe, "createdBy" | "updatedBy" | "createdAt" | "updatedAt">): string[] {
  const line = (verb: string, who: { displayName: string } | null, iso: string) => {
    const when = Number.isNaN(Date.parse(iso)) ? "" : ` on ${date.format(new Date(iso))}`;
    return `${verb}${who ? ` by ${who.displayName}` : ""}${when}`;
  };
  const out = r.createdBy ? [line("Added", r.createdBy, r.createdAt)] : [];
  const edited =
    r.updatedBy !== null && (r.updatedBy.id !== r.createdBy?.id || Date.parse(r.updatedAt) - Date.parse(r.createdAt) > MINUTE);
  if (edited) out.push(line("Edited", r.updatedBy, r.updatedAt));
  return out;
}
