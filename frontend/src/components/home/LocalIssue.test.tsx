import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalIssueLine, LocalTicker } from "./LocalIssue";

// The suite runs in UTC; switch the zone for this file only (Node re-reads TZ when it changes).
const TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "America/Denver";
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = TZ;
});

describe("local clock", () => {
  it("prints the reader's local day, not the server's", () => {
    // 01:00 UTC on Oct 24 is 7 pm on Oct 23 in Denver; the server rendered the UTC day.
    vi.setSystemTime(new Date("2026-10-24T01:00:00Z"));
    render(<LocalIssueLine serverDay="2026-10-24" volume="II" number={5} />);
    expect(screen.getByText("Friday, October 23, 2026")).toBeTruthy();
    expect(screen.getByText("Friday, October 23, 2026").getAttribute("datetime")).toBe("2026-10-23");
  });

  it("flips the season with the local day: Nov 30 in Denver is still autumn at 05:00 UTC Dec 1", () => {
    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
    render(
      <>
        <LocalIssueLine serverDay="2026-12-01" />
        <LocalTicker serverDay="2026-12-01" />
      </>,
    );
    expect(screen.getByText("The Autumn Issue")).toBeTruthy();
    expect(screen.getAllByText("Delicata squash").length).toBeGreaterThan(0);
  });

  it("follows the clock past midnight", () => {
    vi.setSystemTime(new Date("2026-10-24T05:59:00Z"));
    render(<LocalIssueLine serverDay="2026-10-24" />);
    expect(screen.getByText("Friday, October 23, 2026")).toBeTruthy();
    act(() => {
      vi.setSystemTime(new Date("2026-10-24T06:01:00Z"));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Saturday, October 24, 2026")).toBeTruthy();
  });
});
