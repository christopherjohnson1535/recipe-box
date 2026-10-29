import { describe, expect, it } from "vitest";
import type { CookLogEntry } from "@/lib/api";
import { canDelete, cookName, dayLabel, newestFirst, today } from "./cook-log-logic";

const entry = (over: Partial<CookLogEntry> = {}): CookLogEntry => ({
  id: "c1", recipeId: "r1", cookedOn: "2026-10-20", note: "", madeBy: { id: "u1", displayName: "Sam" }, createdAt: "2026-10-20T19:00:00Z", ...over,
});
const now = new Date(2026, 9, 22, 21, 0); // local 22 Oct 2026, 9pm

describe("cook log logic", () => {
  it("names today on the device's own calendar", () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("labels days relative to the reader, with the year only when it differs", () => {
    expect(dayLabel("2026-10-22", now)).toBe("Today");
    expect(dayLabel("2026-10-21", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-20", now)).toBe("Tue, Oct 20");
    expect(dayLabel("2025-12-31", now)).toBe("Wed, Dec 31, 2025");
    expect(dayLabel("2026-10-22", null)).toBe("Thu, Oct 22, 2026"); // server render: no relative words
  });

  it("says who: the member, You, or a former member", () => {
    expect(cookName(entry(), null)).toBe("Sam");
    expect(cookName(entry(), { id: "u1" })).toBe("You");
    expect(cookName(entry({ madeBy: null }), { id: "u1" })).toBe("A former member");
  });

  it("lets the cook or an admin delete, nobody else", () => {
    expect(canDelete(entry(), { id: "u1", role: "member" })).toBe(true);
    expect(canDelete(entry(), { id: "u2", role: "member" })).toBe(false);
    expect(canDelete(entry(), { id: "u2", role: "admin" })).toBe(true);
    expect(canDelete(entry({ madeBy: null }), { id: "u2", role: "member" })).toBe(false);
    expect(canDelete(entry(), null)).toBe(false);
  });

  it("orders by cooking day, then by when it was recorded", () => {
    const a = entry({ id: "a", cookedOn: "2026-10-20", createdAt: "2026-10-21T08:00:00Z" });
    const b = entry({ id: "b", cookedOn: "2026-10-21", createdAt: "2026-10-21T07:00:00Z" });
    const c = entry({ id: "c", cookedOn: "2026-10-20", createdAt: "2026-10-20T08:00:00Z" });
    expect(newestFirst([c, a, b]).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
});
