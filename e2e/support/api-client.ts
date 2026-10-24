import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

// Shapes come from the spec generated from the backend (docs/openapi.json), so the suite fails to type-check when
// the API changes under it. Type-only import: nothing from the frontend is bundled.
import type { components } from "../../frontend/src/lib/api-types.ts";

type Schemas = components["schemas"];
export type Ingredient = Schemas["Ingredient"];
export type Step = Ingredient;
export type RecipeInput = Schemas["RecipeInput"];
export type Recipe = Schemas["Recipe"];
export type RecipeSummary = Schemas["RecipeSummary"];
export type User = Schemas["User"];
export type Image = Schemas["Image"];
export type RecipeDraft = Schemas["RecipeDraft"];
export type ApiError = Schemas["ErrorBody"];
/** Create-user body; `role` is left out for setup (the first user is always the admin). */
export type NewUser = Omit<Schemas["CreateUserBody"], "role"> & { role?: Schemas["CreateUserBody"]["role"] };

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
