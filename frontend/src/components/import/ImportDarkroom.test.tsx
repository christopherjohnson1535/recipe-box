import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type RecipeDraft } from "@/lib/api";
import { ImportScreen, type ImportApi } from "./ImportScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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
    expect(screen.getByText("buttermilk").closest("li")?.getAttribute("data-flagged")).toBe("true");
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
    expect(screen.getByText("flour")).toBeTruthy();
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

  it("flags a doubtful row past the twelfth, and shows every row", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    const ingredients = Array.from({ length: 20 }, (_, i) => ({ text: `${i + 1} cup thing${i}`, section: null }));
    const scores = ingredients.map((_, i) => (i === 14 ? 0.2 : 0.9));
    await act(async () => resolve(draft({ ingredients, confidence: { ingredients: scores } })));
    await screen.findByText("Draft ready: 20 ingredients found.");
    expect(screen.getByText("thing19")).toBeTruthy();
    expect(screen.getByText("thing14").closest("li")?.getAttribute("data-flagged")).toBe("true");
  });

  it("keeps the photo on the stage beside the draft, with the other photos under it", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    await act(async () => resolve(draft({ photoImageIds: ["p1", "p2", "p3"] })));
    await screen.findByText("Draft ready: 2 ingredients found.");
    expect(screen.getByText("Your photo")).toBeTruthy();
    expect(screen.queryByTestId("scan-line")).toBeNull();
    expect(screen.getByText("More photos (2)")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /Original photo/ })).toHaveLength(3);
  });

  it("shows a status heading while reading, and removes the scan when you stop waiting", async () => {
    const { api } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    expect(await screen.findByText("Reading your page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop waiting and edit" }));
    await waitFor(() => expect(screen.queryByTestId("scan-line")).toBeNull());
    expect(screen.queryByText("Reading your page")).toBeNull();
  });

  it("does not leave the scan beside the Link tab", async () => {
    const { api } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    await screen.findByTestId("scan-line");
    fireEvent.click(screen.getByRole("tab", { name: "Link" }));
    expect(screen.queryByTestId("scan-line")).toBeNull();
  });

  it("revokes the photo's object URL when the scan ends and on unmount", async () => {
    const { api, reject } = setup();
    const { unmount } = render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    await screen.findByTestId("scan-line");
    await act(async () => reject(new ApiError(502, "ai_error", "The AI could not read it.")));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x"));
    unmount();
  });

  it("types the title in once for sighted readers while the full title is there at once, and at once with reduced motion", async () => {
    const { api, resolve } = setup();
    render(<ImportScreen api={api} initialMode="photo" />);
    await readPhoto();
    vi.useFakeTimers();
    try {
      await act(async () => resolve(draft()));
      const full = document.querySelector("h3 .sr-only");
      expect(full?.textContent).toBe("Biscuits");
      const typed = () => [...document.querySelector('h3 [aria-hidden="true"]')!.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
      expect(typed()).toBe("");
      for (let i = 0; i < 3; i++) await act(async () => void vi.advanceTimersByTime(28));
      expect(typed()).toBe("Bis");
      for (let i = 0; i < 6; i++) await act(async () => void vi.advanceTimersByTime(28));
      expect(typed()).toBe("Biscuits");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the whole title at once with reduced motion", async () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const { api, resolve } = setup();
      render(<ImportScreen api={api} initialMode="photo" />);
      await readPhoto();
      await act(async () => resolve(draft()));
      expect(document.querySelector('h3 [aria-hidden="true"]')!.firstChild!.textContent).toBe("Biscuits"); // typed text, not the reserved remainder
    } finally {
      window.matchMedia = mm;
    }
  });
});
