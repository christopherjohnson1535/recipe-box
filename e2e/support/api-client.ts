import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

// Types follow docs/API.md.
export type Ingredient = { text: string; section: string | null };
export type Step = { text: string; section: string | null };
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
  imageId?: string | null;
  tags?: string[];
};
export type Recipe = Required<RecipeInput> & { id: string; imageUrl: string | null; createdAt: string; updatedAt: string };
export type RecipeSummary = { id: string; title: string; tags: string[]; totalMinutes: number | null; imageUrl: string | null };
export type User = { id: string; username: string; displayName: string; role: "admin" | "member" };
export type Image = { id: string; url: string; width: number; height: number };
export type RecipeDraft = RecipeInput & { title: string; imageUrl: string | null; warnings: string[]; duplicateOf: string | null };
export type ApiError = { error: { code: string; message: string } };
export type NewUser = { username: string; displayName: string; password: string; role?: "admin" | "member" };

/** A small typed client over a Playwright request context whose baseURL is the web origin (like the browser). */
export class ApiClient {
  constructor(readonly request: APIRequestContext) {}

  /** Parses a JSON body after checking the status, so a failure names the status and the body. */
  private async ok<T>(res: APIResponse, status: number): Promise<T> {
    const text = await res.text();
    expect(res.status(), `${res.url()} -> ${text}`).toBe(status);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  health = () => this.request.get("/api/health");
  setupStatus = async () => (await this.ok<{ needsSetup: boolean }>(await this.request.get("/api/setup"), 200)).needsSetup;
  setupRaw = (u: NewUser) => this.request.post("/api/setup", { data: u });
  loginRaw = (username: string, password: string) => this.request.post("/api/auth/login", { data: { username, password } });
  login = async (username: string, password: string) => this.ok<User>(await this.loginRaw(username, password), 200);
  me = () => this.request.get("/api/auth/me");
  logout = () => this.request.post("/api/auth/logout");

  createUser = async (u: NewUser) => this.ok<User>(await this.request.post("/api/users", { data: { role: "member", ...u } }), 201);
  listUsers = async () => this.ok<User[]>(await this.request.get("/api/users"), 200);
  deleteUser = async (id: string) => this.ok<void>(await this.request.delete(`/api/users/${id}`), 204);

  createRecipe = async (r: RecipeInput) => this.ok<Recipe>(await this.request.post("/api/recipes", { data: r }), 201);
  getRecipe = async (id: string) => this.ok<Recipe>(await this.request.get(`/api/recipes/${id}`), 200);
  updateRecipe = async (id: string, r: RecipeInput) => this.ok<Recipe>(await this.request.put(`/api/recipes/${id}`, { data: r }), 200);
  deleteRecipe = async (id: string) => this.ok<void>(await this.request.delete(`/api/recipes/${id}`), 204);
  restoreRecipe = async (id: string) => this.ok<Recipe>(await this.request.post(`/api/recipes/${id}/restore`), 200);
  listRecipes = async (query: Record<string, string> = {}) =>
    this.ok<{ items: RecipeSummary[]; total: number }>(await this.request.get("/api/recipes", { params: query }), 200);

  uploadPng = async (png: Buffer) =>
    this.ok<Image>(await this.request.post("/api/media", { multipart: { file: { name: "red.png", mimeType: "image/png", buffer: png } } }), 201);

  importUrlRaw = (url: string) => this.request.post("/api/import/url", { data: { url } });
  importUrl = async (url: string) => this.ok<RecipeDraft>(await this.importUrlRaw(url), 200);
}
