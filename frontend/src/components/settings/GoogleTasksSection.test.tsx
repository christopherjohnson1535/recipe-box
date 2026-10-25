import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type GoogleStatus } from "@/lib/api";
import { GoogleTasksSection } from "./GoogleTasksSection";
import { SettingsView } from "./SettingsView";

const replace = vi.spyOn(window.history, "replaceState");
afterEach(() => vi.unstubAllGlobals());

const off: GoogleStatus = { configured: false, connected: false, connectedAt: null };
const ready: GoogleStatus = { configured: true, connected: false, connectedAt: null };
const connected: GoogleStatus = { configured: true, connected: true, connectedAt: "2026-10-20T10:00:00Z" };

const fakeApi = (disconnectGoogle = vi.fn().mockResolvedValue(undefined)) => ({ disconnectGoogle });
const open = (initial: GoogleStatus | null, result?: string, api = fakeApi()) => {
  replace.mockClear();
  render(<GoogleTasksSection initial={initial} result={result} api={api} />);
  return api;
};

describe("GoogleTasksSection", () => {
  it("tells a member the admin can turn it on when the server has no Google set up", () => {
    open(off);
    expect(screen.getByRole("heading", { level: 2, name: "Google Tasks" })).toBeTruthy();
    expect(screen.getByText(/household admin can turn it on/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "deploy guide" }).getAttribute("href")).toContain("DEPLOY.md#google-tasks-optional");
    expect(screen.queryByRole("link", { name: "Connect Google Tasks" })).toBeNull();
  });

  it("says so when the status could not be loaded", () => {
    open(null);
    expect(screen.getByText(/Couldn’t check Google Tasks/)).toBeTruthy();
  });

  it("offers Connect as a full-page link to the API, with a word about the trip to Google", () => {
    open(ready);
    expect(screen.getByRole("link", { name: "Connect Google Tasks" }).getAttribute("href")).toBe("/api/integrations/google/connect");
    expect(screen.getByText(/Google’s consent page, then back here/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect Google Tasks" }).getAttribute("aria-describedby")).toBe(screen.getByText(/consent page/).id);
  });

  it("tells a Home Screen app to connect from the browser, with Connect still there", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    open(ready);
    expect(screen.getByText(/Connect once from Safari \(or your browser\), not the Home Screen app: open Settings there\. After that, sending works here too\./)).toBeTruthy();
    expect(screen.queryByText(/consent page/)).toBeNull();
    expect(screen.getByRole("link", { name: "Connect Google Tasks" })).toBeTruthy();
  });

  it("shows when it was connected, with Disconnect", () => {
    open(connected);
    const connectedLine = screen.getByText("Connected").parentElement!;
    expect(connectedLine.textContent).toMatch(/^Connected on Oct 20, 2026$/);
    expect(connectedLine.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20T10:00:00Z");
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
    expect(screen.getByText(/If Google ends the connection/)).toBeTruthy();
  });

  it("asks first, and Stay connected changes nothing and returns focus to Disconnect", async () => {
    const api = open(connected);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const confirm = screen.getByRole("group", { name: "Confirm" });
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Stay connected" }));
    fireEvent.click(within(confirm).getByRole("button", { name: "Stay connected" }));
    expect(screen.queryByRole("group", { name: "Confirm" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect" })));
    expect(api.disconnectGoogle).not.toHaveBeenCalled();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("disconnects after the confirmation and offers Connect again", async () => {
    const api = open(connected);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Connect Google Tasks" })).toBeTruthy());
    expect(api.disconnectGoogle).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("status")[0].textContent).toContain("Google Tasks disconnected.");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Google Tasks" }));
  });

  it("shows why a disconnect failed and stays connected", async () => {
    open(connected, undefined, fakeApi(vi.fn().mockRejectedValue(new ApiError(500, "internal", "Something broke."))));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Disconnect" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something broke.");
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("announces a successful connection once, in a status region that was already on the page", async () => {
    open(connected, "connected");
    const region = screen.getAllByRole("status")[0];
    expect(region.textContent).toBe("");
    await waitFor(() => expect(region.textContent).toContain("Google Tasks connected."));
    expect(replace).toHaveBeenCalledWith(null, "", "/settings");
  });

  it("announces a failed connection as an alert", async () => {
    open(ready, "error");
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn’t connect Google Tasks. Try again.");
    expect(replace).toHaveBeenCalledWith(null, "", "/settings");
  });

  it("leaves the address alone without a ?google= result", async () => {
    open(ready);
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it("takes an unknown ?google= out of the address without announcing anything", async () => {
    open(ready, "whatever");
    await Promise.resolve();
    expect(replace).toHaveBeenCalledWith(null, "", "/settings");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("status").every((r) => r.textContent === "")).toBe(true);
  });
});

describe("SettingsView", () => {
  it("has a Google Tasks section for a plain member", () => {
    render(
      <SettingsView
        me={{ id: "u2", displayName: "Sam", username: "sam", role: "member", email: null, createdAt: "2026-10-21T10:00:00Z" }}
        users={[]}
        capabilities={null}
        google={off}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Google Tasks" })).toBeTruthy();
  });
});
