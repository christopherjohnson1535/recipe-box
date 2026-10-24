// Typed client for the API (docs/openapi.json). Works in the browser (relative /api through the web origin)
// and on the server (API_INTERNAL_URL + the caller's forwarded cookie, see server-api.ts).

import type { components } from "./api-types";

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
export type RecipeQuery = { q?: string; tag?: string; sort?: RecipeSort; limit?: number; offset?: number };

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

export function createApi({ baseUrl = "", cookie, fetch: fetchImpl = fetch }: ApiOptions = {}) {
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

  return {
    health: () => get<Health>("/api/health"),
    getSetup: () => get<Schemas["SetupStatus"]>("/api/setup"),
    setup: (body: Schemas["SetupBody"]) => request<User>("POST", "/api/setup", body),

    login: (body: Schemas["LoginBody"]) => request<User>("POST", "/api/auth/login", body),
    logout: () => request<void>("POST", "/api/auth/logout"),
    me: () => get<User>("/api/auth/me"),

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
    deleteUser: (userId: string) => request<void>("DELETE", `/api/users/${id(userId)}`),
    setPassword: (userId: string, password: string, currentPassword?: string) =>
      request<void>("PUT", `/api/users/${id(userId)}/password`, currentPassword === undefined ? { password } : { password, currentPassword }),

    getSettings: () => get<Settings>("/api/settings"),
    updateSettings: (body: Settings) => request<Settings>("PUT", "/api/settings", body),

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
