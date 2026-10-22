import { describe, expect, it } from "vitest";
import { bylines } from "./byline";

const chris = { id: "u1", displayName: "Chris" };
const sam = { id: "u2", displayName: "Sam" };
const at = (createdAt: string, updatedAt: string) => ({ createdAt, updatedAt });

describe("bylines", () => {
  it("shows only Added when nobody edited it", () => {
    expect(bylines({ createdBy: chris, updatedBy: chris, ...at("2026-10-21T10:00:00Z", "2026-10-21T10:00:20Z") })).toEqual([
      { verb: "Added", who: "Chris", iso: "2026-10-21T10:00:00Z" },
    ]);
  });
  it("adds Edited when someone else edited it", () => {
    expect(bylines({ createdBy: chris, updatedBy: sam, ...at("2026-10-21T10:00:00Z", "2026-10-21T10:00:05Z") })).toEqual([
      { verb: "Added", who: "Chris", iso: "2026-10-21T10:00:00Z" },
      { verb: "Edited", who: "Sam", iso: "2026-10-21T10:00:05Z" },
    ]);
  });
  it("adds Edited when the same person edited it later", () => {
    expect(bylines({ createdBy: chris, updatedBy: chris, ...at("2026-10-21T10:00:00Z", "2026-10-23T10:00:00Z") })[1]).toEqual({
      verb: "Edited",
      who: "Chris",
      iso: "2026-10-23T10:00:00Z",
    });
  });
  it("copes with removed members and no editor", () => {
    expect(bylines({ createdBy: null, updatedBy: null, ...at("2026-10-21T10:00:00Z", "2026-10-23T10:00:00Z") })).toEqual([]);
    expect(bylines({ createdBy: null, updatedBy: sam, ...at("2026-10-21T10:00:00Z", "2026-10-21T10:00:00Z") })).toEqual([
      { verb: "Edited", who: "Sam", iso: "2026-10-21T10:00:00Z" },
    ]);
  });
});
