// Typed client for the API (docs/openapi.json). Works in the browser (relative /api through the web origin)
// and on the server (API_INTERNAL_URL + the caller's forwarded cookie, see server-api.ts).

import type { components } from "./api-types";
import type { GroceryItem, GroceryList, GrocerySection, ItemPatch } from "@/components/groceries/types";

// Every shape below is generated from the backend's OpenAPI spec (docs/openapi.json, see docs/API.md).
type Schemas = components["schemas"];

export type Ingredient = Schemas["Ingredient"];
export type Step = Ingredient;
export type SourceType = Schemas["SourceType"];
export type RecipeInput = Schemas["RecipeInput"];
export type UserRef = Schemas["UserRef"];
export type Recipe = Schemas["Recipe"];
export type RecipeSummary = Schemas["RecipeSummary"];
export type RecipeDraft = Schemas["RecipeDraft"];
export type User = Schemas["User"];
export type Role = User["role"];
export type Image = Schemas["Image"];
export type Tag = Schemas["TagCount"];
export type Health = Schemas["Health"];
export type Capabilities = Schemas["Capabilities"];
export type Settings = Schemas["Settings"];
export type RecipeSort = Schemas["RecipeSort"];
export type RecipePage = Schemas["RecipePage"];
export type ImportSummary = Schemas["ImportSummary"];
export type GoogleStatus = Schemas["GoogleStatus"];
export type GoogleExport = Schemas["GoogleExport"];
/** Connecting is a full-page navigation (a link, not a fetch): Google's consent page, then back to /settings?google=connected|error. */
export const GOOGLE_CONNECT_URL = "/api/integrations/google/connect";
export type AuthProviders = Schemas["AuthProviders"];
export type Identity = Schemas["Identity"];
/** Signing in with Google is a full-page navigation (a link, not a fetch or popup, so it works in the Home Screen app too). */
export const googleSignInUrl = (next: string) => `/api/auth/google/start?next=${encodeURIComponent(next)}`;
/** Linking a Google account to the signed-in member; the API sends them back to /settings?signin=linked|taken|error. */
export const GOOGLE_LINK_URL = "/api/auth/google/start?link=1";
export type RecipeQuery = { q?: string; tag?: string; sort?: RecipeSort; limit?: number; offset?: number };

/** Dispatched on `window` after every grocery write, so the nav badge (and any other open view) refetches. */
export const GROCERY_CHANGED = "grocery:changed";

/** A non-2xx API response (`code` from the API's error body) or `network` when the API can't be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The whole `error` object, e.g. `photoImageIds` on a PHO-5 `ai_disabled`. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiOptions = {
  /** "" in the browser; API_INTERNAL_URL on the server. */
  baseUrl?: string;
  /** Raw Cookie header to forward (server-side only). */
  cookie?: string;
  fetch?: typeof fetch;
};

// The default looks `fetch` up per call, so a fetch installed after this module loads (tests, polyfills) is the one used.
export function createApi({ baseUrl = "", cookie, fetch: fetchImpl = (input, init) => fetch(input, init) }: ApiOptions = {}) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body; // fetch sets the multipart boundary
    } else if (body !== undefined) {
      headers.set("content-type", "application/json");
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetchImpl(baseUrl + path, { method, headers, body: payload, cache: "no-store" });
    } catch {
      throw new ApiError(0, "network", "Can’t reach the Recipe Box server. Check your connection and try again.");
    }

    if (!res.ok) {
      const error = await res
        .json()
        .then((b: { error?: Record<string, unknown> }) => b?.error)
        .catch(() => undefined);
      const code = typeof error?.code === "string" ? error.code : "internal";
      const message = typeof error?.message === "string" ? error.message : `Request failed (${res.status}).`;
      throw new ApiError(res.status, code, message, error ?? {});
    }
    if (res.status === 204) return undefined as T;
    if ((res.headers.get("content-type") ?? "").includes("application/json")) return (await res.json()) as T;
    return (await res.blob()) as T;
  }

  const get = <T>(path: string) => request<T>("GET", path);
  const id = encodeURIComponent;
  /** A grocery write that worked: tell the rest of the page. */
  const groceryWrite = async <T>(method: string, path: string, body?: unknown) => {
    const result = await request<T>(method, path, body);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(GROCERY_CHANGED));
    return result;
  };

  return {
    health: () => get<Health>("/api/health"),
    getSetup: () => get<Schemas["SetupStatus"]>("/api/setup"),
    setup: (body: Schemas["SetupBody"]) => request<User>("POST", "/api/setup", body),

    login: (body: Schemas["LoginBody"]) => request<User>("POST", "/api/auth/login", body),
    logout: () => request<void>("POST", "/api/auth/logout"),
    me: () => get<User>("/api/auth/me"),
    authProviders: () => get<AuthProviders>("/api/auth/providers"),
    listIdentities: () => get<Identity[]>("/api/auth/identities"),
    deleteIdentity: (identityId: string) => request<void>("DELETE", `/api/auth/identities/${id(identityId)}`),

    listRecipes: (query: RecipeQuery = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      const qs = params.toString();
      return get<RecipePage>(`/api/recipes${qs ? `?${qs}` : ""}`);
    },
    createRecipe: (body: RecipeInput) => request<Recipe>("POST", "/api/recipes", body),
    getRecipe: (recipeId: string) => get<Recipe>(`/api/recipes/${id(recipeId)}`),
    updateRecipe: (recipeId: string, body: RecipeInput) => request<Recipe>("PUT", `/api/recipes/${id(recipeId)}`, body),
    deleteRecipe: (recipeId: string) => request<void>("DELETE", `/api/recipes/${id(recipeId)}`),
    restoreRecipe: (recipeId: string) => request<Recipe>("POST", `/api/recipes/${id(recipeId)}/restore`),

    listTags: () => get<Tag[]>("/api/tags"),

    uploadMedia: (file: Blob) => {
      const form = new FormData();
      form.append("file", file);
      return request<Image>("POST", "/api/media", form);
    },

    importCapabilities: () => get<Capabilities>("/api/import/capabilities"),
    importUrl: (url: string) => request<RecipeDraft>("POST", "/api/import/url", { url } satisfies Schemas["ImportUrlBody"]),
    importText: (text: string, sourceUrl?: string) =>
      request<RecipeDraft>("POST", "/api/import/text", (sourceUrl ? { text, sourceUrl } : { text }) satisfies Schemas["ImportTextBody"]),
    importPhoto: (files: Blob[], mode: Schemas["PhotoMode"]) => {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.append("mode", mode);
      return request<RecipeDraft>("POST", "/api/import/photo", form);
    },

    listUsers: () => get<User[]>("/api/users"),
    createUser: (body: Schemas["CreateUserBody"]) => request<User>("POST", "/api/users", body),
    /** Sets (or, with null, clears) the Google address that may sign in as this member. Admin only. */
    updateUserEmail: (userId: string, email: string | null) =>
      request<User>("PATCH", `/api/users/${id(userId)}`, { email } satisfies Schemas["UpdateUserBody"]),
    deleteUser: (userId: string) => request<void>("DELETE", `/api/users/${id(userId)}`),
    setPassword: (userId: string, password: string, currentPassword?: string) =>
      request<void>("PUT", `/api/users/${id(userId)}/password`, currentPassword === undefined ? { password } : { password, currentPassword }),

    getSettings: () => get<Settings>("/api/settings"),
    updateSettings: (body: Settings) => request<Settings>("PUT", "/api/settings", body),

    getGrocery: () => get<GroceryList>("/api/grocery"),
    /** Adds the recipe, or sets the scale of one already on the list. */
    addGroceryRecipe: (recipeId: string, scale = 1) => groceryWrite<GroceryList>("POST", "/api/grocery/recipes", { recipeId, scale }),
    removeGroceryRecipe: (recipeId: string) => groceryWrite<GroceryList>("DELETE", `/api/grocery/recipes/${id(recipeId)}`),
    addGroceryItem: (text: string, section?: GrocerySection) =>
      groceryWrite<GroceryItem>("POST", "/api/grocery/items", section ? { text, section } : { text }),
    patchGroceryItem: (itemId: string, patch: ItemPatch) => groceryWrite<GroceryItem>("PATCH", `/api/grocery/items/${id(itemId)}`, patch),
    removeGroceryItem: (itemId: string) => groceryWrite<void>("DELETE", `/api/grocery/items/${id(itemId)}`),
    clearGroceryChecked: () => groceryWrite<GroceryList>("POST", "/api/grocery/clear-checked"),
    emptyGrocery: () => groceryWrite<void>("DELETE", "/api/grocery"),

    googleStatus: () => get<GoogleStatus>("/api/integrations/google"),
    disconnectGoogle: () => request<void>("DELETE", "/api/integrations/google"),
    /** Replaces the member's Google Tasks "Groceries" list with the unticked items (staples only when asked). */
    exportGroceryToGoogleTasks: (includeStaples: boolean) =>
      request<GoogleExport>("POST", "/api/grocery/export/google-tasks", { includeStaples } satisfies Schemas["GoogleExportRequest"]),

    exportAll: () => get<Blob>("/api/export"),
    importExport: (file: Blob) => {
      const form = new FormData();
      form.append("file", file);
      return request<ImportSummary>("POST", "/api/import/export", form);
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** Browser client: same-origin relative URLs, the browser sends the cookie itself. */
export const api = createApi();
