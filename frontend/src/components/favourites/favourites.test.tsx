import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { FavouriteStar } from "./FavouriteStar";
import { keepFavourites, notKept } from "./keep-favourites";
import { KeepFavourites } from "./KeepFavourites";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  refresh.mockClear();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const api = (over: Partial<{ addFavourite: () => Promise<void>; removeFavourite: () => Promise<void> }> = {}) => ({
  addFavourite: vi.fn(async () => undefined),
  removeFavourite: vi.fn(async () => undefined),
  ...over,
});

describe("FavouriteStar", () => {
  it("stars a tile at once, names the recipe and announces the change", async () => {
    const calls = api();
    render(<FavouriteStar recipeId="r1" title="Lentil soup" initial={false} variant="tile" api={calls} />);
    const star = screen.getByRole("button", { name: "Favourite: Lentil soup" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(star);
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.querySelector("svg")?.getAttribute("class")).toContain("star-pop");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added “Lentil soup” to your favourites."));
    expect(calls.addFavourite).toHaveBeenCalledWith("r1");
    expect(refresh).not.toHaveBeenCalled(); // the card stays put, focus with it
  });

  it("does not play the press for a star that is on when the page loads", () => {
    render(<FavouriteStar recipeId="r1" title="Soup" initial variant="tile" api={api()} />);
    const svg = screen.getByRole("button").querySelector("svg");
    expect(svg?.getAttribute("class")).not.toContain("star-pop");
    expect(svg?.getAttribute("class")).toContain("fill-(--star-fg)");
  });

  it("unstars on the recipe page, keeping the same name", async () => {
    const calls = api();
    render(<FavouriteStar recipeId="r1" title="Soup" initial variant="page" api={calls} />);
    const star = screen.getByRole("button", { name: "Favourite" });
    expect(star.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(star);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Removed “Soup” from your favourites."));
    expect(calls.removeFavourite).toHaveBeenCalledWith("r1");
    expect(screen.getByRole("button", { name: "Favourite" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("turns back and says so when the request fails", async () => {
    const calls = api({ addFavourite: async () => Promise.reject(new ApiError(0, "network", "down")) });
    render(<FavouriteStar recipeId="r1" title="Soup" initial={false} variant="page" api={calls} />);
    fireEvent.click(screen.getByRole("button", { name: "Favourite" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Couldn’t add it to your favourites. Try again."));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the recipe was deleted elsewhere", async () => {
    const calls = api({ removeFavourite: async () => Promise.reject(new ApiError(404, "not_found", "Recipe not found.")) });
    render(<FavouriteStar recipeId="r1" title="Soup" initial variant="tile" api={calls} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("“Soup” was deleted."));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(refresh).toHaveBeenCalled();
  });

  it("is off while offline, with the reason tied to it", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { unmount } = render(<FavouriteStar recipeId="r1" title="Soup" initial={false} variant="page" api={api()} />);
    const page = screen.getByRole("button", { name: "Favourite" });
    expect(page).toHaveProperty("disabled", true);
    expect(page.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(page.getAttribute("aria-describedby")!)?.textContent).toBe("You’re offline. Starring needs the server.");
    unmount();
    render(<FavouriteStar recipeId="r1" title="Soup" initial={false} variant="tile" api={api()} />);
    const tile = screen.getByRole("button", { name: "Favourite: Soup" });
    expect(tile).toHaveProperty("disabled", true);
    expect(document.getElementById(tile.getAttribute("aria-describedby")!)?.textContent).toBe("You’re offline. Starring needs the server.");
  });
});

/** A fake service worker that answers CACHE_URLS on the message port, recording what it was asked to keep. */
function fakeWorker() {
  const asked: string[][] = [];
  const active = {
    postMessage: (msg: { payload: { urlsToCache: string[] } }, ports: MessagePort[]) => {
      asked.push(msg.payload.urlsToCache);
      ports[0].postMessage(true);
    },
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ active }) } });
  return asked;
}

const page = (ids: string[]) => ({ items: ids.map((id) => ({ id })), total: ids.length }) as never;

describe("keepFavourites", () => {
  it("asks the worker for the favourites the device has not kept, four at a time", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const asked = fakeWorker();
    const kept = new Set(["/recipes/b"]);
    vi.stubGlobal("caches", { open: async () => ({ match: async (path: string) => (kept.has(path) ? {} : undefined) }) });
    const listRecipes = vi.fn(async () => page(["a", "b", "c", "d", "e", "f"]));
    await keepFavourites({ listRecipes });
    expect(listRecipes).toHaveBeenCalledWith({ favourite: true, limit: 30 });
    expect(asked).toEqual([
      ["/recipes/a", "/recipes/c", "/recipes/d", "/recipes/e"],
      ["/recipes/f"],
    ]);
  });

  it("does nothing in development, offline, or when the list can't be read", async () => {
    const listRecipes = vi.fn(async () => page(["a"]));
    await keepFavourites({ listRecipes });
    expect(listRecipes).not.toHaveBeenCalled(); // NODE_ENV is "test"

    vi.stubEnv("NODE_ENV", "production");
    const asked = fakeWorker();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await keepFavourites({ listRecipes });
    expect(listRecipes).not.toHaveBeenCalled();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await expect(keepFavourites({ listRecipes: async () => Promise.reject(new ApiError(401, "unauthenticated", "x")) })).resolves.toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("after a change keeps a newly starred page, and re-keeps an unstarred one only if it was kept", async () => {
    const { rekeep } = await import("./keep-favourites");
    vi.stubEnv("NODE_ENV", "production");
    const asked = fakeWorker();
    const kept = new Set(["/recipes/old"]);
    vi.stubGlobal("caches", { open: async () => ({ match: async (path: string) => (kept.has(path) ? {} : undefined) }) });
    await rekeep("new", true);
    await rekeep("old", false);
    await rekeep("never", false);
    expect(asked).toEqual([["/recipes/new"], ["/recipes/old"]]);
  });

  it("treats every page as missing without Cache Storage", async () => {
    expect(await notKept(["/recipes/a"], undefined)).toEqual(["/recipes/a"]);
  });

  it("runs once when the signed-in layout mounts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fakeWorker();
    vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    await act(async () => void render(<KeepFavourites />));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toBe("/api/recipes?favourite=true&limit=30");
  });
});
