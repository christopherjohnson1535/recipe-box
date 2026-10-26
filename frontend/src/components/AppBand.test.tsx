import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { AppBand } from "./AppBand";

/** Renders inside an async act: the count is read with use(), which suspends until its promise settles. */
const draw = async (ui: ReactElement) => {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(ui);
  });
  return view;
};
const counted = (n: number | undefined) => Promise.resolve(n);

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
  it("prints the day and season at once and fills the count in when it arrives", async () => {
    let arrive: (n: number) => void = () => undefined;
    await draw(<AppBand serverDay="2026-10-25" count={new Promise<number>((r) => (arrive = r))} />);
    // Nothing waits for the count: the band, Sign out included, is already there without it.
    expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    await act(async () => arrive(24));
    expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn · 24 recipes");
  });

  describe("on the reader's clock", () => {
    beforeEach(() => {
      process.env.TZ = "America/Denver";
      vi.useFakeTimers();
    });

    it("switches to the browser's local day, not the server's", async () => {
      // 01:00 UTC on Oct 26 is 7 pm on Sunday Oct 25 in Denver; the server rendered the UTC day.
      vi.setSystemTime(new Date("2026-10-26T01:00:00Z"));
      await draw(<AppBand serverDay="2026-10-26" count={counted(2)} />);
      await act(async () => undefined); // let the count's promise settle
      expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn · 2 recipes");
      expect(screen.getByText("Sunday, October 25").getAttribute("datetime")).toBe("2026-10-25");
    });

    it("flips the season with the local day: Nov 30 in Denver is still autumn at 05:00 UTC Dec 1", async () => {
      vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
      await draw(<AppBand serverDay="2026-12-01" />);
      expect(screen.getByText(/Autumn/)).toBeTruthy();
    });

    it("follows the clock past midnight", async () => {
      vi.setSystemTime(new Date("2026-10-26T05:59:00Z"));
      await draw(<AppBand serverDay="2026-10-26" />);
      expect(screen.getByText("Sunday, October 25")).toBeTruthy();
      act(() => {
        vi.setSystemTime(new Date("2026-10-26T06:01:00Z"));
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText("Monday, October 26")).toBeTruthy();
    });
  });

  it("hydrates streamed server HTML, count included, without a mismatch", async () => {
    const html = await new Promise<string>((resolve, reject) => {
      const chunks: string[] = [];
      const sink = new Writable({ write: (c, _e, done) => (chunks.push(String(c)), done()) });
      sink.on("finish", () => resolve(chunks.join("")));
      const stream = renderToPipeableStream(<AppBand serverDay="2026-10-25" count={Promise.resolve(7)} />, {
        onAllReady: () => stream.pipe(sink),
        onError: reject,
      });
    });
    expect(html).toContain("7 recipes");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, <AppBand serverDay="2026-10-25" count={Promise.resolve(7)} />); // a console.error here fails the test
    });
    expect(host.querySelector("p")?.textContent).toBe("Sunday, October 25 · Autumn · 7 recipes");
    act(() => root.unmount());
    host.remove();
  });

  it("leaves the count out when the layout could not read it, with or without a promise", async () => {
    const { unmount } = await draw(<AppBand serverDay="2026-10-25" count={counted(undefined)} />);
    await act(async () => undefined);
    expect(screen.getByText(/October 25/).closest("p")?.textContent).toBe("Sunday, October 25 · Autumn");
    unmount();
    await draw(<AppBand serverDay="2026-10-25" />);
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
    await draw(<AppBand serverDay="2026-10-25" displayName="Chris" />);
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.getAttribute("title")).toBe("Signed in as Chris");
    fireEvent.click(button);
    await waitFor(() => expect(calls.replace).toHaveBeenCalledWith("/login"));
    expect(logouts).toBe(1);
    expect(calls.dismiss).toHaveBeenCalledTimes(1);
    expect(calls.forget).toHaveBeenCalledTimes(1);
    expect(calls.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows 'Signing out…' and ignores a second click while the first is in flight", async () => {
    let logouts = 0;
    let finish: () => void = () => undefined;
    const gate = new Promise<void>((r) => (finish = r));
    server.use(
      http.post("*/api/auth/logout", async () => {
        logouts += 1;
        await gate;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await draw(<AppBand serverDay="2026-10-25" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const busy = await screen.findByRole("button", { name: "Signing out…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    finish();
    await waitFor(() => expect(calls.replace).toHaveBeenCalledWith("/login"));
    expect(logouts).toBe(1);
  });

  it("leaves even when the API is unreachable", async () => {
    server.use(http.post("*/api/auth/logout", () => HttpResponse.error()));
    await draw(<AppBand serverDay="2026-10-25" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls.replace).toHaveBeenCalledWith("/login"));
    expect(calls.forget).toHaveBeenCalledTimes(1);
  });
});
