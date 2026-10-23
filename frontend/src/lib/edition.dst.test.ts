import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { msUntilNextSwitch } from "./edition";

const H = 3_600_000;
let oldTz: string | undefined;
beforeAll(() => {
  oldTz = process.env.TZ;
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  if (oldTz === undefined) delete process.env.TZ;
  else process.env.TZ = oldTz;
});

describe("msUntilNextSwitch on DST days (America/New_York)", () => {
  it("is anchored to wall-clock 07:00 and 19:00", () => {
    // Spring forward 2026-03-08: 02:00 -> 03:00, the night is one hour short.
    expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).toBe(240); // guards that TZ took effect
    expect(msUntilNextSwitch(new Date(2026, 2, 8, 18, 30))).toBe(30 * 60_000);
    expect(msUntilNextSwitch(new Date(2026, 2, 7, 19, 0, 1))).toBe(11 * H - 1000); // 19:00 -> 07:00 across the jump
    // Fall back 2026-11-01: 02:00 -> 01:00, the night is one hour long.
    expect(msUntilNextSwitch(new Date(2026, 10, 1, 18, 30))).toBe(30 * 60_000);
    expect(msUntilNextSwitch(new Date(2026, 9, 31, 19, 0, 1))).toBe(13 * H - 1000);
  });
});
