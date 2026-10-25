import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { AppBand } from "./AppBand";

const calls = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), forget: vi.fn(async () => undefined), dismiss: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: calls.replace, refresh: calls.refresh }) }));
vi.mock("./offline/forget", () => ({ forgetOffline: calls.forget }));
vi.mock("./undo/undo-store", () => ({ dismissUndo: calls.dismiss }));

// The suite runs in UTC; switch the zone for the local-day cases only (Node re-reads TZ when it changes).
const TZ = process.env.TZ;
beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z")); // a Sunday
});
afterEach(() => {
  process.env.TZ = TZ;
  vi.clearAllMocks();
});

describe("AppBand", () => {
  it("prints the day, season and count", () => {
    render(<AppBand serverDay="2026-10-25" count={24} />);
    expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn · 24 recipes");
  });

  describe("on the reader's clock", () => {
    beforeEach(() => {
      process.env.TZ = "America/Denver";
      vi.useFakeTimers();
    });

    it("switches to the browser's local day, not the server's", () => {
      // 01:00 UTC on Oct 26 is 7 pm on Sunday Oct 25 in Denver; the server rendered the UTC day.
      vi.setSystemTime(new Date("2026-10-26T01:00:00Z"));
      render(<AppBand serverDay="2026-10-26" count={2} />);
      expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn · 2 recipes");
      expect(screen.getByText("Sunday, October 25").getAttribute("datetime")).toBe("2026-10-25");
    });

    it("flips the season with the local day: Nov 30 in Denver is still autumn at 05:00 UTC Dec 1", () => {
      vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
      render(<AppBand serverDay="2026-12-01" />);
      expect(screen.getByText(/Autumn/)).toBeTruthy();
    });

    it("follows the clock past midnight", () => {
      vi.setSystemTime(new Date("2026-10-26T05:59:00Z"));
      render(<AppBand serverDay="2026-10-26" />);
      expect(screen.getByText("Sunday, October 25")).toBeTruthy();
      act(() => {
        vi.setSystemTime(new Date("2026-10-26T06:01:00Z"));
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText("Monday, October 26")).toBeTruthy();
    });
  });

  it("leaves the count out when the layout could not read it", () => {
    render(<AppBand serverDay="2026-10-25" />);
    expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn");
  });

  it("signs out: ends the session, drops the pending Undo and the offline copies, then goes to /login", async () => {
    let logouts = 0;
    server.use(
      http.post("*/api/auth/logout", () => {
        logouts += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<AppBand serverDay="2026-10-25" displayName="Chris" />);
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.getAttribute("title")).toBe("Signed in as Chris");
    fireEvent.click(button);
    await waitFor(() => expect(calls.replace).toHaveBeenCalledWith("/login"));
    expect(logouts).toBe(1);
    expect(calls.dismiss).toHaveBeenCalledTimes(1);
    expect(calls.forget).toHaveBeenCalledTimes(1);
    expect(calls.refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves even when the API is unreachable", async () => {
    server.use(http.post("*/api/auth/logout", () => HttpResponse.error()));
    render(<AppBand serverDay="2026-10-25" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls.replace).toHaveBeenCalledWith("/login"));
    expect(calls.forget).toHaveBeenCalledTimes(1);
  });
});
