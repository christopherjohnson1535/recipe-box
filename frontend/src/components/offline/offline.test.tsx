import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetOffline } from "./forget";
import { OfflineBanner } from "./OfflineBanner";
import { OfflineNote } from "./OfflineNote";
import { SavedRecipes } from "./SavedRecipes";

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}
const goOffline = () => act(() => {
  setOnline(false);
  window.dispatchEvent(new Event("offline"));
});

afterEach(() => vi.restoreAllMocks());

describe("offline banner and notes", () => {
  it("shows nothing online and appears when the network drops, then goes again", () => {
    setOnline(true);
    render(
      <>
        <OfflineBanner />
        <OfflineNote id="n">Saving waits.</OfflineNote>
      </>,
    );
    expect(screen.queryByText("You’re offline")).toBeNull();
    goOffline();
    expect(screen.getByText("You’re offline")).toBeTruthy();
    expect(screen.getByText("Saving waits.").id).toBe("n");
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText("You’re offline")).toBeNull();
  });
});

describe("SavedRecipes", () => {
  it("lists the recipes kept on this device", async () => {
    render(<SavedRecipes load={async () => [{ href: "/recipes/a", title: "Lasagne" }]} />);
    expect(await screen.findByRole("link", { name: /Lasagne/ })).toHaveProperty("pathname", "/recipes/a");
    expect(screen.getByText(/Recipes you’ve opened here before still open/)).toBeTruthy();
  });

  it("says how to keep one when none are", async () => {
    render(<SavedRecipes load={async () => []} />);
    expect(await screen.findByText(/no recipes are yet/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("reloads on Try again", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<SavedRecipes load={async () => []} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });
});

describe("forgetOffline", () => {
  it("deletes only the runtime caches and tells the worker", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { keys: async () => ["rb-pages", "rb-media", "serwist-precache-v2"], delete: del });
    const postMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", { value: { controller: { postMessage } }, configurable: true });
    await forgetOffline();
    expect(del.mock.calls.map((c) => c[0])).toEqual(["rb-pages", "rb-media"]);
    expect(postMessage).toHaveBeenCalledWith({ type: "FORGET_OFFLINE" });
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("never throws when storage is blocked", async () => {
    vi.stubGlobal("caches", { keys: async () => Promise.reject(new Error("SecurityError")) });
    await expect(forgetOffline()).resolves.toBeUndefined();
  });
});
