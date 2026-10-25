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

  it("does not claim there are no recipes before it has looked", async () => {
    let finish!: (k: { href: string; title: string }[]) => void;
    render(<SavedRecipes load={() => new Promise((r) => (finish = r))} />);
    expect(screen.getByText("This page isn’t saved on this device.")).toBeTruthy();
    expect(screen.queryByText(/no recipes are yet|still open/)).toBeNull();
    await act(async () => finish([]));
    expect(screen.getByText(/no recipes are yet/)).toBeTruthy();
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

describe("keptRecipes", () => {
  it("lists kept recipe pages newest first, skipping cooking mode and untitled pages", async () => {
    const { keptRecipes } = await import("./SavedRecipes");
    const id = (n: number) => `0f8e2b4c-1a2b-4c3d-8e9f-01234567890${n}`;
    const pages: Record<string, string> = {
      [`http://localhost:3000/recipes/${id(1)}`]: "<title>Soup · Recipe Box</title>",
      [`http://localhost:3000/recipes/${id(1)}/cook`]: "<title>Cooking Soup · Recipe Box</title>",
      [`http://localhost:3000/recipes/${id(2)}`]: "<title>Stew · Recipe Box</title>",
      [`http://localhost:3000/recipes/${id(3)}`]: "<p>no title</p>",
    };
    const cache = {
      keys: async () => Object.keys(pages).map((url) => ({ url })),
      match: async (req: { url: string }) => ({ text: async () => pages[req.url] }),
    };
    vi.stubGlobal("caches", { open: async () => cache });
    expect(await keptRecipes()).toEqual([
      { href: `/recipes/${id(2)}`, title: "Stew" },
      { href: `/recipes/${id(1)}`, title: "Soup" },
    ]);
  });

  it("is empty without Cache Storage", async () => {
    const { keptRecipes } = await import("./SavedRecipes");
    vi.stubGlobal("caches", undefined);
    expect(await keptRecipes()).toEqual([]);
  });
});

describe("KeepOffline", () => {
  it("renders the marker the worker looks for", async () => {
    const { KeepOffline } = await import("./KeepOffline");
    const { KEEP_MARKER } = await import("./rules");
    const { container } = render(<KeepOffline />);
    expect(container.innerHTML.includes(KEEP_MARKER) || document.head.innerHTML.includes(KEEP_MARKER)).toBe(true);
  });
});

describe("OfflineSupport", () => {
  const ID = "0f8e2b4c-1a2b-4c3d-8e9f-0123456789ab";
  async function mount(pathname: string, controller: object | null = null) {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => pathname }));
    const postMessage = vi.fn();
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register, controller, ready: Promise.resolve({ active: { postMessage } }) },
      configurable: true,
    });
    const { OfflineSupport } = await import("./OfflineSupport");
    render(<OfflineSupport />);
    await act(async () => {});
    return { register, postMessage };
  }
  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    vi.doUnmock("next/navigation");
  });

  it("does nothing outside production builds", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { register, postMessage } = await mount(`/recipes/${ID}`);
    expect(register).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("registers the worker and asks it to keep a recipe page after navigation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setOnline(true);
    const { register, postMessage } = await mount(`/recipes/${ID}`);
    expect(register).toHaveBeenCalledWith("/serwist/sw.js", { scope: "/" });
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_URLS", payload: { urlsToCache: [`/recipes/${ID}`] } });
  });

  it("does not fetch the page again when the worker already saw it load", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setOnline(true);
    const { postMessage } = await mount(`/recipes/${ID}`, {});
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not ask to keep other pages", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setOnline(true);
    const { postMessage } = await mount("/settings");
    expect(postMessage).not.toHaveBeenCalled();
  });
});
