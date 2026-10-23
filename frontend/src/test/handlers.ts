import { http, HttpResponse } from "msw";
import type { Capabilities, Health, Image, Recipe, RecipeDraft, RecipeSummary, Tag, User } from "@/lib/api";

// Typed against the types api.ts re-exports from the generated OpenAPI types (src/lib/api-types.ts).
// "*/api/..." matches both the browser's relative URLs and server-side absolute ones.
export const user: User = { id: "u1", username: "chris", displayName: "Chris", role: "admin", createdAt: "2026-01-01T00:00:00Z" };
export const summary: RecipeSummary = {
  id: "r1", title: "Soup", description: "", totalMinutes: 30, tags: [], imageUrl: null, sourceType: "manual", updatedAt: "2026-01-01T00:00:00Z",
};
export const recipe: Recipe = {
  id: "r1", title: "Soup", description: "", ingredients: [], steps: [], servings: null, prepMinutes: null, cookMinutes: null,
  totalMinutes: null, notes: "", sourceUrl: null, sourceName: null, sourceType: "manual", imageId: null, photoImageIds: [], tags: [],
  imageUrl: null, photoUrls: [], createdBy: null, updatedBy: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
export const draft: RecipeDraft = {
  title: "Pancakes", description: "", ingredients: [], steps: [], servings: null, prepMinutes: null, cookMinutes: null,
  totalMinutes: null, notes: "", sourceUrl: null, sourceName: null, sourceType: "manual", imageId: null, photoImageIds: [],
  tags: [], imageUrl: null, warnings: [], duplicateOf: null,
};
export const image: Image = { id: "i1", url: "/media/i1.jpg", width: 1, height: 1 };

export const handlers = [
  http.get("*/api/health", () => HttpResponse.json<Health>({ status: "ok", db: "ok", version: "test" })),
  http.get("*/api/setup", () => HttpResponse.json({ needsSetup: false })),
  http.post("*/api/setup", () => HttpResponse.json(user, { status: 201 })),
  http.post("*/api/auth/login", () => HttpResponse.json(user)),
  http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
  http.get("*/api/auth/me", () => HttpResponse.json(user)),
  http.get("*/api/recipes", () => HttpResponse.json({ items: [summary], total: 1 })),
  http.post("*/api/recipes", () => HttpResponse.json(recipe, { status: 201 })),
  http.get("*/api/recipes/:id", () => HttpResponse.json(recipe)),
  http.put("*/api/recipes/:id", () => HttpResponse.json(recipe)),
  http.delete("*/api/recipes/:id", () => new HttpResponse(null, { status: 204 })),
  http.post("*/api/recipes/:id/restore", () => HttpResponse.json(recipe)),
  http.get("*/api/tags", () => HttpResponse.json<Tag[]>([{ name: "dinner", count: 1 }])),
  http.post("*/api/media", () => HttpResponse.json(image, { status: 201 })),
  http.get("*/api/import/capabilities", () => HttpResponse.json<Capabilities>({ ai: false, provider: "none" })),
  http.post("*/api/import/url", () => HttpResponse.json(draft)),
  http.post("*/api/import/text", () => HttpResponse.json(draft)),
  http.post("*/api/import/photo", () => HttpResponse.json(draft)),
  http.get("*/api/users", () => HttpResponse.json<User[]>([user])),
  http.post("*/api/users", () => HttpResponse.json(user, { status: 201 })),
  http.delete("*/api/users/:id", () => new HttpResponse(null, { status: 204 })),
  http.put("*/api/users/:id/password", () => new HttpResponse(null, { status: 204 })),
  http.get("*/api/export", () => new HttpResponse("{}", { headers: { "content-type": "application/zip" } })),
  http.post("*/api/import/export", () => HttpResponse.json({ imported: 0, skipped: 0 })),
];
