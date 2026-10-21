// Typed client for docs/API.md. Works in the browser (relative /api through the web origin)
// and on the server (API_INTERNAL_URL + the caller's forwarded cookie, see server-api.ts).

export type Ingredient = { text: string; section: string | null };
export type Step = { text: string; section: string | null };
export type SourceType = "manual" | "link" | "photo" | "text";

export type RecipeInput = {
  title: string;
  description?: string;
  ingredients?: Ingredient[];
  steps?: Step[];
  servings?: string | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  notes?: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourceType?: SourceType;
  imageId?: string | null;
  photoImageIds?: string[];
  tags?: string[];
};

export type UserRef = { id: string; displayName: string };

export type Recipe = Required<RecipeInput> & {
  id: string;
  imageUrl: string | null;
  photoUrls: string[];
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeSummary = {
  id: string;
  title: string;
  description: string;
  totalMinutes: number | null;
  tags: string[];
  imageUrl: string | null;
  sourceType: SourceType;
  updatedAt: string;
};

export type RecipeDraft = Omit<RecipeInput, "title"> & {
  title: string;
  imageUrl: string | null;
  warnings: string[];
  duplicateOf: string | null;
};

export type Role = "admin" | "member";
export type User = { id: string; username: string; displayName: string; role: Role; createdAt: string };
export type Image = { id: string; url: string; width: number; height: number };
export type Tag = { name: string; count: number };
export type Health = { status: string; db: string; version: string };
export type Capabilities = { ai: boolean; provider: "none" | "anthropic" };
export type RecipeSort = "newest" | "title" | "time";
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
    getSetup: () => get<{ needsSetup: boolean }>("/api/setup"),
    setup: (body: { username: string; displayName: string; password: string }) =>
      request<User>("POST", "/api/setup", body),

    login: (body: { username: string; password: string }) => request<User>("POST", "/api/auth/login", body),
    logout: () => request<void>("POST", "/api/auth/logout"),
    me: () => get<User>("/api/auth/me"),

    listRecipes: (query: RecipeQuery = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      const qs = params.toString();
      return get<{ items: RecipeSummary[]; total: number }>(`/api/recipes${qs ? `?${qs}` : ""}`);
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
    importUrl: (url: string) => request<RecipeDraft>("POST", "/api/import/url", { url }),
    importText: (text: string, sourceUrl?: string) =>
      request<RecipeDraft>("POST", "/api/import/text", sourceUrl ? { text, sourceUrl } : { text }),
    importPhoto: (files: Blob[], mode: "recipe" | "dish") => {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.append("mode", mode);
      return request<RecipeDraft>("POST", "/api/import/photo", form);
    },

    listUsers: () => get<User[]>("/api/users"),
    createUser: (body: { username: string; displayName: string; password: string; role: Role }) =>
      request<User>("POST", "/api/users", body),
    deleteUser: (userId: string) => request<void>("DELETE", `/api/users/${id(userId)}`),
    setPassword: (userId: string, password: string, currentPassword?: string) =>
      request<void>("PUT", `/api/users/${id(userId)}/password`, currentPassword === undefined ? { password } : { password, currentPassword }),

    exportAll: () => get<Blob>("/api/export"),
    importExport: (file: Blob) => {
      const form = new FormData();
      form.append("file", file);
      return request<{ imported: number; skipped: number }>("POST", "/api/import/export", form);
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** Browser client: same-origin relative URLs, the browser sends the cookie itself. */
export const api = createApi();
