import type { SerwistPlugin } from "serwist";
import { describe, expect, it } from "vitest";
import { KEEP_MARKER } from "./rules";
import { createSession } from "./worker-plugins";

const ID = "0f8e2b4c-1a2b-4c3d-8e9f-0123456789ab";
const URL_ = `http://localhost:3000/recipes/${ID}?servings=6`;
const KEY = `http://localhost:3000/recipes/${ID}`;
const html = `<html><head><meta ${KEEP_MARKER} content="1"/><title>Soup · Recipe Box</title></head></html>`;

/** A CacheStorage that, like the real one, re-creates a cache that is opened after it was deleted. */
function fakeStore(seed: Record<string, string[]> = {}) {
  const data = new Map<string, Map<string, Response>>(Object.entries(seed).map(([n, ks]) => [n, new Map(ks.map((k) => [k, new Response("old")]))]));
  const cache = (name: string) => ({
    put: async (req: Request | string, res: Response) => void data.get(name)!.set(typeof req === "string" ? req : req.url, res),
    delete: async (req: Request | string) => data.get(name)!.delete(typeof req === "string" ? req : req.url),
  });
  const store = {
    keys: async () => [...data.keys()],
    delete: async (name: string) => data.delete(name),
    open: async (name: string) => {
      if (!data.has(name)) data.set(name, new Map());
      return cache(name);
    },
  } as unknown as CacheStorage;
  const entries = (name: string) => [...(data.get(name)?.keys() ?? [])];
  return { store, entries, names: () => [...data.keys()] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

type Params = Record<string, unknown>;
const call = (plugin: SerwistPlugin, name: string, params: Params) => (plugin as Record<string, (p: Params) => Promise<unknown>>)[name]?.(params);

/**
 * Serwist's order in Strategy.cachePut, step by step: handlerWillStart, then every cacheWillUpdate in plugin order
 * (each sees the previous one's result), then the put, then every cacheDidUpdate. `between` runs after the last
 * cacheWillUpdate and before the put (where serwist awaits caches.open and the old-entry lookup).
 */
async function cachePut(plugins: SerwistPlugin[], store: CacheStorage, cacheName: string, response: Response, states: Map<SerwistPlugin, Params>, between?: () => Promise<void>) {
  const request = new Request(URL_);
  let toCache: Response | null = response;
  for (const p of plugins) {
    const out = (await call(p, "cacheWillUpdate", { request, response: toCache, state: states.get(p) })) as Response | null | undefined;
    if (out !== undefined) toCache = out;
    if (!toCache) return false;
  }
  await between?.();
  const cache = await store.open(cacheName);
  await cache.put(KEY, toCache);
  for (const p of plugins) await call(p, "cacheDidUpdate", { cacheName, request: new Request(KEY), newResponse: toCache, state: states.get(p) });
  return true;
}

/** Like serwist, every plugin gets a state object of its own. */
const start = async (plugins: SerwistPlugin[]) => {
  const state = new Map<SerwistPlugin, Params>(plugins.map((p) => [p, {}]));
  for (const p of plugins) await call(p, "handlerWillStart", { state: state.get(p) });
  return state;
};

describe("sign-out wipe", () => {
  it("drops every rb-* cache and nothing else", async () => {
    const { store, names } = fakeStore({ "rb-pages": [KEY], "rb-media": ["m"], "workbox-precache": ["shell"] });
    await createSession(store).forgetAll();
    expect(names()).toEqual(["workbox-precache"]);
  });

  it("a signed-out response wipes; a normal one does not", async () => {
    const { store, names } = fakeStore({ "rb-pages": [KEY] });
    const { watchSession } = createSession(store);
    await call(watchSession, "fetchDidSucceed", { response: new Response("ok") });
    expect(names()).toEqual(["rb-pages"]);
    await call(watchSession, "fetchDidSucceed", { response: new Response("no", { status: 401 }) });
    expect(names()).toEqual([]);
  });
});

describe("a wipe while a page is in flight", () => {
  const plugins = (s: ReturnType<typeof createSession>) => [s.watchSession, ...s.pageStore("rb-pages"), s.sameSession];

  it("keeps nothing when the wipe lands while the page body is being read (the old race)", async () => {
    const { store, names } = fakeStore();
    const s = createSession(store);
    const ps = plugins(s);
    const state = await start(ps);
    const body = deferred<string>();
    const res = new Response(html);
    res.clone = () => ({ text: () => body.promise }) as unknown as Response; // the page plugin awaits this
    const put = cachePut(ps, store, "rb-pages", res, state);
    await s.forgetAll(); // sign-out while the body is still being read
    body.resolve(html);
    expect(await put).toBe(false);
    expect(names()).toEqual([]);
  });

  it("removes the entry when the wipe lands after the last check but before the put", async () => {
    const { store, entries, names } = fakeStore();
    const s = createSession(store);
    const ps = plugins(s);
    const state = await start(ps);
    const put = await cachePut(ps, store, "rb-pages", new Response(html), state, () => s.forgetAll());
    expect(put).toBe(true); // it got as far as the put ...
    expect(entries("rb-pages")).toEqual([]); // ... and cacheDidUpdate took the old session's page out again
    expect(names().every((n) => n.startsWith("rb-"))).toBe(true);
  });

  it("keeps the page when no wipe happened", async () => {
    const { store, entries } = fakeStore();
    const s = createSession(store);
    const ps = plugins(s);
    expect(await cachePut(ps, store, "rb-pages", new Response(html), await start(ps))).toBe(true);
    expect(entries("rb-pages")).toEqual([KEY]);
  });

  it("a fetch that starts after the wipe is the new session's and is kept", async () => {
    const { store, entries } = fakeStore();
    const s = createSession(store);
    const ps = plugins(s);
    await s.forgetAll();
    expect(await cachePut(ps, store, "rb-pages", new Response(html), await start(ps))).toBe(true);
    expect(entries("rb-pages")).toEqual([KEY]);
  });

  it("the same holds for API responses and photos", async () => {
    for (const cacheName of ["rb-api", "rb-media"]) {
      const { store, entries } = fakeStore();
      const s = createSession(store);
      const ps = [s.watchSession, s.okOnly(cacheName), s.sameSession];
      expect(await cachePut(ps, store, cacheName, new Response("x"), await start(ps), () => s.forgetAll())).toBe(true);
      expect(entries(cacheName)).toEqual([]);
      const late = await start(ps);
      await s.forgetAll();
      expect(await cachePut(ps, store, cacheName, new Response("x"), late)).toBe(false);
      expect(entries(cacheName)).toEqual([]);
    }
  });
});

describe("what is stored", () => {
  const run = (res: Response, name = "rb-api") => {
    const { store, entries } = fakeStore();
    const s = createSession(store);
    const ps = [s.okOnly(name), s.sameSession];
    return start(ps).then((state) => cachePut(ps, store, name, res, state)).then((stored) => ({ stored, entries: entries(name) }));
  };

  it("stores a plain 200 even with Cache-Control: no-store (the feature depends on it)", async () => {
    expect((await run(new Response("{}", { headers: { "Cache-Control": "no-store" } }))).stored).toBe(true);
  });

  it("skips errors and responses that set a cookie", async () => {
    expect((await run(new Response("x", { status: 500 }))).stored).toBe(false);
    expect((await run(new Response("x", { headers: { "Set-Cookie": "rb_session=1" } }))).stored).toBe(false);
  });

  it("a 404 drops the stale copy", async () => {
    const { store, entries } = fakeStore({ "rb-api": [URL_] });
    const s = createSession(store);
    await call(s.okOnly("rb-api"), "cacheWillUpdate", { request: new Request(URL_), response: new Response("gone", { status: 404 }) });
    expect(entries("rb-api")).toEqual([]);
  });

  it("pages: keyed by path, only a marked render, no cookie, and a 404 drops the copy", async () => {
    const { store, entries } = fakeStore({ "rb-pages": [KEY] });
    const s = createSession(store);
    const [key, keep] = s.pageStore("rb-pages");
    expect(await call(key, "cacheKeyWillBeUsed", { request: new Request(URL_) })).toBe(KEY);
    const req = new Request(URL_);
    expect(await call(keep, "cacheWillUpdate", { request: req, response: new Response("<p>server down</p>") })).toBeNull();
    expect(await call(keep, "cacheWillUpdate", { request: req, response: new Response(html, { headers: { "Set-Cookie": "a=b" } }) })).toBeNull();
    expect(entries("rb-pages")).toEqual([KEY]);
    await call(keep, "cacheWillUpdate", { request: req, response: new Response("", { status: 404 }) });
    expect(entries("rb-pages")).toEqual([]);
  });
});

describe("stale", () => {
  it("is false only for a fetch that began in the current generation", async () => {
    const s = createSession(fakeStore().store);
    const state: Params = {};
    expect(s.stale(state)).toBe(true); // never began: treated as stale
    s.begin(state);
    expect(s.stale(state)).toBe(false);
    await s.forgetAll();
    expect(s.stale(state)).toBe(true);
  });
});
