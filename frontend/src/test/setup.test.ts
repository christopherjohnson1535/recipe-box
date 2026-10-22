import { describe, expect, it } from "vitest";
import { FIXED_NOW } from "./clock";
import { expectConsole } from "./console";

describe("shared test setup", () => {
  it("runs in UTC with a fixed en-US locale and a pinned clock", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
    expect(new Intl.DateTimeFormat().resolvedOptions()).toMatchObject({ timeZone: "UTC", locale: "en-US" });
    expect(new Date()).toEqual(FIXED_NOW);
  });

  it("lets a test opt out of console failures", () => {
    expectConsole("error", /expected boom/);
    console.error("expected boom");
  });
});
