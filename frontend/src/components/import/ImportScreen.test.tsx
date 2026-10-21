import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type RecipeDraft } from "@/lib/api";
import { ImportScreen, type ImportApi } from "./ImportScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title: "Best pancakes",
  ingredients: [{ text: "2 eggs", section: null }],
  steps: [{ text: "Whisk.", section: null }],
  sourceUrl: "https://example.com/pancakes",
  sourceType: "link",
  imageId: null,
  imageUrl: null,
  warnings: [],
  duplicateOf: null,
  ...over,
});

function mockApi(over: Partial<Record<keyof ImportApi, unknown>> = {}) {
  return {
    importCapabilities: vi.fn().mockResolvedValue({ ai: true, provider: "anthropic" }),
    importUrl: vi.fn().mockResolvedValue(draft()),
    importText: vi.fn().mockResolvedValue(draft({ sourceType: "text" })),
    importPhoto: vi.fn().mockResolvedValue(draft({ sourceType: "photo", photoImageIds: ["p1"] })),
    createRecipe: vi.fn().mockResolvedValue({ id: "r-1" }),
    uploadMedia: vi.fn(),
    listTags: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as ImportApi & { [K in keyof ImportApi]: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  push.mockReset();
  window.history.replaceState(null, "", "/");
});

const importLink = (address = "https://example.com/pancakes") => {
  fireEvent.change(screen.getByLabelText("Recipe link"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
};
const fail = (status: number, code: string, message = "m", details = {}) => new ApiError(status, code, message, details);

describe("ImportScreen", () => {
  it("imports a link, focuses the review heading and saves through createRecipe", async () => {
    const api = mockApi();
    render(<ImportScreen api={api} />);
    importLink();
    const heading = await screen.findByRole("heading", { name: "Check the recipe" });
    expect(api.importUrl).toHaveBeenCalledWith("https://example.com/pancakes");
    expect(document.activeElement).toBe(heading);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Best pancakes");

    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/r-1"));
    expect(api.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ title: "Best pancakes", sourceType: "link" }));
  });

  it("adds https:// to a bare address and shows draft warnings", async () => {
    const api = mockApi({ importUrl: vi.fn().mockResolvedValue(draft({ warnings: ["No photo."] })) });
    render(<ImportScreen api={api} />);
    importLink("example.com/pancakes");
    expect(await screen.findByText("No photo.")).toBeTruthy();
    expect(api.importUrl).toHaveBeenCalledWith("https://example.com/pancakes");
  });

  it("warns about a duplicate and continues on Import anyway", async () => {
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockResolvedValue(draft({ duplicateOf: "old-1" })) })} />);
    importLink();
    expect(await screen.findByText("You already have this recipe")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the existing recipe" }).getAttribute("href")).toBe("/recipes/old-1");
    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import anyway" }));
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("offers the text mode, keeping the link as the source, when the site blocks us", async () => {
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockRejectedValue(fail(502, "site_blocked")) })} />);
    importLink();
    expect((await screen.findByRole("alert")).textContent).toMatch(/won’t let us read/);
    fireEvent.click(screen.getByRole("button", { name: "Paste the recipe text instead" }));
    expect(screen.getByRole("tab", { name: "Text", selected: true })).toBeTruthy();
    expect((screen.getByLabelText(/Where it came from/) as HTMLInputElement).value).toBe("https://example.com/pancakes");
    expect(window.location.search).toBe("?mode=text");
  });

  it("puts a validation error under the address field", async () => {
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockRejectedValue(fail(400, "validation", "url: That is not a web address.")) })} />);
    importLink("nope");
    expect(await screen.findByText("That is not a web address.")).toBeTruthy();
    expect(screen.getByLabelText("Recipe link").getAttribute("aria-invalid")).toBe("true");
  });

  it("starts the link import by itself from ?url=", async () => {
    const api = mockApi();
    render(<ImportScreen api={api} initialUrl="https://example.com/pancakes" />);
    await screen.findByRole("heading", { name: "Check the recipe" });
    expect(api.importUrl).toHaveBeenCalledTimes(1);
  });

  it("says coming soon for text that the server answers with 501", async () => {
    render(<ImportScreen api={mockApi({ importText: vi.fn().mockRejectedValue(fail(501, "not_implemented")) })} initialMode="text" />);
    fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "2 eggs. Whisk." } });
    fireEvent.click(screen.getByRole("button", { name: "Read the text" }));
    expect(await screen.findByText("Coming soon")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Type it in" }).getAttribute("href")).toBe("/recipes/new");
  });

  it("shows the stored photos beside an empty form when AI is off, and saves them with the recipe", async () => {
    const api = mockApi({
      importCapabilities: vi.fn().mockResolvedValue({ ai: false, provider: "none" }),
      importPhoto: vi.fn().mockRejectedValue(fail(422, "ai_disabled", "off", { photoImageIds: ["aaa", "bbb"] })),
    });
    render(<ImportScreen api={api} initialMode="photo" />);
    await screen.findByText(/AI is off, so the photos cannot be read/);
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Keep photos and type it in" }));

    expect(await screen.findByRole("heading", { name: "Type it in" })).toBeTruthy();
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["/media/aaa.jpg", "/media/bbb.jpg"]);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Gran’s cake" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(api.createRecipe).toHaveBeenCalled());
    expect(api.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ title: "Gran’s cake", sourceType: "photo", photoImageIds: ["aaa", "bbb"] }));
  });

  it("limits to six photos and lets one be removed", () => {
    render(<ImportScreen api={mockApi()} initialMode="photo" />);
    const files = Array.from({ length: 8 }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files } });
    expect(screen.getAllByRole("img")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    expect(screen.getAllByRole("img")).toHaveLength(5);
  });

  it("stops waiting and ignores a late answer", async () => {
    let resolve!: (d: RecipeDraft) => void;
    const api = mockApi({ importUrl: vi.fn(() => new Promise<RecipeDraft>((r) => (resolve = r))) });
    render(<ImportScreen api={api} />);
    importLink();
    expect((await screen.findByRole("status")).textContent).toMatch(/Fetching the page/);
    fireEvent.click(screen.getByRole("button", { name: "Stop waiting and edit" }));
    resolve(draft());
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Check the recipe" })).toBeNull();
    expect(screen.getByLabelText("Recipe link")).toBeTruthy();
  });
});
