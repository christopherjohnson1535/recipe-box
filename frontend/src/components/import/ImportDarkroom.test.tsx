import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type RecipeDraft } from "@/lib/api";
import { ImportScreen, type ImportApi } from "./ImportScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const draft = (over: Record<string, unknown> = {}) =>
  ({
    title: "Biscuits",
    description: "",
    notes: "",
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    sourceName: null,
    photoImageIds: ["p1"],
    tags: [],
    ingredients: [
      { text: "2 cups flour", section: null },
      { text: "3/4 cup buttermilk", section: null },
    ],
    steps: [],
    sourceUrl: null,
    sourceType: "photo",
    imageId: null,
    imageUrl: null,
    warnings: [],
    duplicateOf: null,
    ...over,
  }) as RecipeDraft;

function setup(caps = { ai: true, provider: "anthropic" }) {
  let resolve!: (d: RecipeDraft) => void;
  let reject!: (e: unknown) => void;
  const pending = new Promise<RecipeDraft>((res, rej) => ((resolve = res), (reject = rej)));
  const api = {
    importCapabilities: vi.fn().mockResolvedValue(caps),
    importUrl: vi.fn(() => pending),
    importText: vi.fn(() => pending),
    importPhoto: vi.fn(() => pending),
    createRecipe: vi.fn(),
    uploadMedia: vi.fn(),
    listTags: vi.fn().mockResolvedValue([]),
  } as unknown as ImportApi;
  return { api, resolve, reject };
}

const readPhoto = async () => {
  const file = new File(["x"], "IMG_1.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Read the photos" });
  fireEvent.click(screen.getByRole("button", { name: "Read the photos" }));
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("import darkroom", () => {
  it("scans only while the photo request is in flight, and stops on error", async () => {
    const { api, reject } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    expect(screen.queryByTestId("scan-line")).toBeNull();
    await readPhoto();
    expect(await screen.findByTestId("scan-line")).toBeTruthy();
    await act(async () => reject(new ApiError(502, "ai_error", "The AI could not read it.")));
    await waitFor(() => expect(screen.queryByTestId("scan-line")).toBeNull());
    expect(screen.getByText("The import failed")).toBeTruthy();
  });

  it("does not scan when AI is off", async () => {
    const { api } = setup({ ai: false, provider: "none" });
    render(<ImportScreen api={api} initialMode="photo" />);
    await screen.findByRole("button", { name: "Keep photos and type it in" });
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    expect(screen.queryByTestId("scan-line")).toBeNull();
    expect(screen.getByText(/AI is off/)).toBeTruthy();
  });

  it("shows a domain card while a link is read, and a note for warnings with the draft", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} />);
    fireEvent.change(screen.getByLabelText("Recipe link"), { target: { value: "https://www.example.com/biscuits" } });
    fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
    expect(await screen.findByText("From the web")).toBeTruthy();
    expect(screen.queryByTestId("scan-line")).toBeNull();
    await act(async () => resolve(draft({ sourceType: "link", photoImageIds: [], sourceUrl: "https://www.example.com/biscuits", warnings: ["The oven temperature is smudged."] })));
    expect(await screen.findByText("The oven temperature is smudged.")).toBeTruthy();
    expect(screen.getByText("Check these before saving")).toBeTruthy();
    expect(screen.getByText("From the web")).toBeTruthy();
  });

  it("flags rows under 0.6 and draws region boxes only when they are present", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    await act(async () =>
      resolve(draft({ confidence: { ingredients: [0.98, 0.5] }, regions: [{ x: 0.1, y: 0.1, w: 0.4, h: 0.2 }] })),
    );
    expect(await screen.findAllByRole("img", { name: /low confidence/i })).toHaveLength(1);
    expect(screen.getByText("3/4 cup buttermilk").closest("li")?.getAttribute("data-flagged")).toBe("true");
    expect(screen.getAllByTestId("region")).toHaveLength(1);
  });

  it("flags nothing and draws no boxes when the draft has no confidence or regions", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    await act(async () => resolve(draft()));
    await screen.findByText("Draft ready: 2 ingredients found.");
    expect(screen.queryAllByRole("img", { name: /low confidence/i })).toHaveLength(0);
    expect(screen.queryAllByTestId("region")).toHaveLength(0);
    expect(screen.getByText("2 cups flour")).toBeTruthy();
  });

  it("switches mode with the arrow keys between Photo, Link and Paste text", () => {
    render(<ImportScreen api={setup().api} initialMode="photo" />);
    const photo = screen.getByRole("tab", { name: "Photo" });
    photo.focus();
    fireEvent.keyDown(photo, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Link", selected: true })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Link" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tab", { name: "Paste text", selected: true })).toBeTruthy();
  });
});
