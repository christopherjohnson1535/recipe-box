import type { CookLogEntry, User } from "@/lib/api";
import { dayKey, noon } from "@/lib/local-day";

/** Today on this device, as the API wants it (`YYYY-MM-DD`). The cook's own day, never the server's. */
export const today = (now = new Date()) => dayKey(now);

/**
 * "Today", "Yesterday", else "Tue, Oct 20" (the year only when it is not this year). With `now` of null (the server
 * render, which does not know the reader's calendar) always the full date, "Tue, Oct 20, 2026".
 */
export function dayLabel(day: string, now: Date | null = new Date()): string {
  if (!now) return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(noon(day));
  const t = today(now);
  if (day === t) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === dayKey(yesterday)) return "Yesterday";
  const date = noon(day);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

/** Who made it: the member's name, "You" for the signed-in member, or a neutral line once they were removed. */
export function cookName(entry: CookLogEntry, me: Pick<User, "id"> | null): string {
  if (!entry.madeBy) return "A former member";
  return me && entry.madeBy.id === me.id ? "You" : entry.madeBy.displayName;
}

/** The API's rule (docs/API.md): the member who made an entry, or an admin, may delete it. */
export function canDelete(entry: CookLogEntry, me: Pick<User, "id" | "role"> | null): boolean {
  if (!me) return false;
  return me.role === "admin" || entry.madeBy?.id === me.id;
}

/** The Delete button's name: "Delete your entry for Yesterday", or "Delete Sam’s entry for Yesterday". */
export function deleteLabel(entry: CookLogEntry, me: Pick<User, "id"> | null, day: string): string {
  const who = cookName(entry, me);
  return who === "You" ? `Delete your entry for ${day}` : `Delete ${who === "A former member" ? "a former member’s" : `${who}’s`} entry for ${day}`;
}

/** Newest first, as the API returns them: cooking day, then when recorded, then id. For merging in a new entry. */
export function newestFirst(entries: CookLogEntry[]): CookLogEntry[] {
  return [...entries].sort((a, b) => b.cookedOn.localeCompare(a.cookedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** The longest note the API takes (characters). */
export const MAX_NOTE = 2000;
