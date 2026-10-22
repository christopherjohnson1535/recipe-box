import { describe, expect, it } from "vitest";
import { bylines } from "./byline";

const chris = { id: "u1", displayName: "Chris" };
const sam = { id: "u2", displayName: "Sam" };

describe("bylines", () => {
  it("shows only Added when nobody edited it", () => {
    expect(bylines({ createdBy: chris, updatedBy: chris, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-21T10:00:20Z" })).toEqual([
      "Added by Chris on Oct 21, 2026",
    ]);
  });
  it("adds Edited when someone else edited it", () => {
    expect(bylines({ createdBy: chris, updatedBy: sam, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-21T10:00:05Z" })).toEqual([
      "Added by Chris on Oct 21, 2026",
      "Edited by Sam on Oct 21, 2026",
    ]);
  });
  it("adds Edited when the same person edited it later", () => {
    expect(bylines({ createdBy: chris, updatedBy: chris, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-23T10:00:00Z" })[1]).toBe(
      "Edited by Chris on Oct 23, 2026",
    );
  });
  it("copes with removed members and no editor", () => {
    expect(bylines({ createdBy: null, updatedBy: null, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-23T10:00:00Z" })).toEqual([]);
    expect(bylines({ createdBy: null, updatedBy: sam, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-21T10:00:00Z" })).toEqual([
      "Edited by Sam on Oct 21, 2026",
    ]);
  });
});
