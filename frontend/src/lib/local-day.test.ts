import { describe, expect, it } from "vitest";
import { bandDate, dayKey, noon, seasonOf } from "./local-day";

describe("local day helpers", () => {
  it.each([
    [new Date(2026, 1, 28), "Winter"],
    [new Date(2026, 2, 1), "Spring"],
    [new Date(2026, 4, 31), "Spring"],
    [new Date(2026, 5, 1), "Summer"],
    [new Date(2026, 7, 31), "Summer"],
    [new Date(2026, 8, 1), "Autumn"],
    [new Date(2026, 10, 30), "Autumn"],
    [new Date(2026, 11, 1), "Winter"],
    [new Date(2026, 0, 1), "Winter"],
  ])("%s is %s", (date, season) => expect(seasonOf(date)).toBe(season));

  it("round-trips a calendar day through noon and dayKey", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayKey(noon("2026-10-25"))).toBe("2026-10-25");
  });

  it("writes the weekday, month and day without a year", () => {
    expect(bandDate(noon("2026-10-25"))).toBe("Sunday, October 25");
    expect(bandDate(noon("2026-12-01"))).toBe("Tuesday, December 1");
  });
});
