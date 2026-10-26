import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTicker } from "./LocalTicker";

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

describe("local ticker", () => {
  it("follows the local season: Nov 30 in Denver is still autumn at 05:00 UTC Dec 1", () => {
    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
    render(<LocalTicker serverDay="2026-12-01" />);
    expect(screen.getAllByText("Delicata squash").length).toBeGreaterThan(0);
  });
});
