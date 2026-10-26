import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type RecipeDraft } from "@/lib/api";
import { ImportScreen, type ImportApi } from "./ImportScreen";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title: "Best pancakes",
  description: "",
  notes: "",
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  sourceName: null,
  photoImageIds: [],
  tags: [],
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
  vi.restoreAllMocks();
  push.mockReset();
  refresh.mockReset();
  window.history.replaceState(null, "", "/");
});

const importLink = (address = "https://example.com/pancakes") => {
  fireEvent.change(screen.getByLabelText("Recipe link"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
};
const fail = (status: number, code: string, message = "m", details = {}) => new ApiError(status, code, message, details);

describe("ImportScreen", () => {
  it("explains what happens next beside the form, and not while a request is in flight", async () => {
    const api = mockApi({ importUrl: vi.fn().mockReturnValue(new Promise(() => {})) });
    render(<ImportScreen api={api} />);
    expect(screen.getByRole("complementary", { name: "How importing works" })).toBeTruthy();
    importLink();
    await waitFor(() => expect(api.importUrl).toHaveBeenCalled());
    expect(screen.queryByRole("complementary", { name: "How importing works" })).toBeNull();
  });

  it("keeps the tabs and the form in place, with focus, when a request starts and ends", async () => {
    let finish!: (d: RecipeDraft) => void;
    const api = mockApi({ importUrl: vi.fn().mockReturnValue(new Promise<RecipeDraft>((r) => (finish = r))) });
    render(<ImportScreen api={api} />);
    const tab = screen.getByRole("tab", { name: "Link" });
    const field = screen.getByLabelText("Recipe link");
    tab.focus();
    importLink();
    await waitFor(() => expect(api.importUrl).toHaveBeenCalled());
    // example.com has a site card, so this request shows the dark stage and the help steps aside
    expect(screen.queryByRole("complementary", { name: "How importing works" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Link" })).toBe(tab);
    expect(screen.getByLabelText("Recipe link")).toBe(field);
    expect(document.activeElement).toBe(tab);
    await act(async () => finish(draft()));
  });

  it("says only what is true about importing while AI is off, and describes reading while it is on", async () => {
    render(<ImportScreen api={mockApi({ importCapabilities: vi.fn().mockResolvedValue({ ai: false, provider: "none" }) })} />);
    await waitFor(() => expect(screen.getByText(/photos to type it in from/)).toBeTruthy());
    expect(screen.queryByText(/or the text itself/)).toBeNull();
  });

  it("describes reading photos and text in the help when AI is on", async () => {
    render(<ImportScreen api={mockApi()} />);
    await waitFor(() => expect(screen.getByText(/or the text itself/)).toBeTruthy());
  });

  it("turns Import off while offline, says why, and sends nothing", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const api = mockApi();
    render(<ImportScreen api={api} />);
    const button = screen.getByRole("button", { name: "Import recipe" });
    expect(button).toHaveProperty("disabled", true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toMatch(/You’re offline/);
    fireEvent.submit(button.closest("form")!);
    expect(api.importUrl).not.toHaveBeenCalled();
  });

  it("imports a link, focuses the review heading and saves through createRecipe", async () => {
    const api = mockApi();
    render(<ImportScreen api={api} />);
    importLink();
    const heading = await screen.findByRole("heading", { name: "Check the recipe" });
    expect(api.importUrl).toHaveBeenCalledWith("https://example.com/pancakes");
    // Focus moves in a passive effect that can run just after the heading is in the DOM, so wait for it.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Best pancakes");

    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipes/r-1"));
    expect(refresh).toHaveBeenCalledTimes(1); // the recipe count in the top band is re-read
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
    expect(screen.getByRole("tab", { name: "Paste text", selected: true })).toBeTruthy();
    expect((screen.getByLabelText(/Where it came from/) as HTMLInputElement).value).toBe("https://example.com/pancakes");
    expect(window.location.search).toBe("?mode=text");
  });

  it("puts a validation error under the address field", async () => {
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockRejectedValue(fail(400, "validation", "url: That is not a web address.")) })} />);
    importLink("nope");
    expect(await screen.findByText("Enter a full web address starting with https://")).toBeTruthy();
    expect(screen.getByLabelText("Recipe link").getAttribute("aria-invalid")).toBe("true");
  });

  it("offers Try again and typing it in after a server error, and retries", async () => {
    const importUrl = vi.fn().mockRejectedValueOnce(fail(500, "internal", "Something went wrong.")).mockResolvedValue(draft());
    render(<ImportScreen api={mockApi({ importUrl })} />);
    importLink();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Something went wrong/);
    expect(screen.getByRole("link", { name: "Type it in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Check the recipe" });
    expect(importUrl).toHaveBeenCalledTimes(2);
  });

  it("links back to sign in when the session is gone", async () => {
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockRejectedValue(fail(401, "unauthenticated")) })} />);
    importLink();
    await screen.findByText("You have been signed out");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?next=%2Fimport%3Fmode%3Dlink");
  });

  it("shows a sourceUrl error under the source field and focuses it", async () => {
    render(<ImportScreen api={mockApi({ importText: vi.fn().mockRejectedValue(fail(400, "validation", "sourceUrl: must be an http(s) URL.")) })} initialMode="text" />);
    fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "2 eggs. Whisk." } });
    fireEvent.click(screen.getByRole("button", { name: "Read the text" }));
    expect(await screen.findByText("Enter a full web address starting with https://")).toBeTruthy();
    const source = screen.getByLabelText(/Where it came from/);
    expect(source.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(source));
    expect(screen.getByLabelText("Recipe text").getAttribute("aria-invalid")).toBeNull();
  });

  it("keeps the pending note when the tab is switched mid-request, and names the origin in Start over", async () => {
    let resolve!: (d: RecipeDraft) => void;
    const api = mockApi({ importUrl: vi.fn(() => new Promise<RecipeDraft>((r) => (resolve = r))) });
    render(<ImportScreen api={api} />);
    importLink();
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("tab", { name: "Photo" }));
    expect((screen.getByRole("status")).textContent).toMatch(/Fetching the page/);
    expect(screen.getByRole("button", { name: "Stop waiting and edit" })).toBeTruthy();
    resolve(draft());
    await screen.findByRole("heading", { name: "Check the recipe" });
    expect(screen.getByRole("button", { name: "Start over with a different link" })).toBeTruthy();
  });

  it("asks before importing a shared ?url= and fetches nothing until confirmed", async () => {
    const api = mockApi();
    render(<ImportScreen api={api} initialUrl="https://example.com/pancakes" />);
    expect(screen.getByRole("heading", { name: "Import this page?" })).toBeTruthy();
    expect(screen.getByText("https://example.com/pancakes")).toBeTruthy();
    expect(api.importUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Import this recipe" }));
    await screen.findByRole("heading", { name: "Check the recipe" });
    expect(api.importUrl).toHaveBeenCalledTimes(1);
    expect(api.importUrl).toHaveBeenCalledWith("https://example.com/pancakes");
  });

  it("drops a shared address on Not this one without importing", () => {
    const api = mockApi();
    render(<ImportScreen api={api} initialUrl="https://example.com/pancakes" />);
    fireEvent.click(screen.getByRole("button", { name: "Not this one" }));
    expect((screen.getByLabelText("Recipe link") as HTMLInputElement).value).toBe("");
    expect(api.importUrl).not.toHaveBeenCalled();
  });

  it("shows a note, and no import, when the shared address was refused", () => {
    const api = mockApi();
    render(<ImportScreen api={api} sharedRejected />);
    expect(screen.getByText("That link can’t be imported")).toBeTruthy();
    expect(api.importUrl).not.toHaveBeenCalled();
  });

  // No import mode answers 501 any more (only export does), so this uses photo as a synthetic stub to keep the generic mapping covered.
  it("says coming soon for a mode the server answers with 501", async () => {
    render(<ImportScreen api={mockApi({ importPhoto: vi.fn().mockRejectedValue(fail(501, "not_implemented")) })} initialMode="photo" />);
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [new File(["x"], "page.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Read the photos" }));
    expect(await screen.findByText("Coming soon")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Type it in" }).getAttribute("href")).toBe("/recipes/new");
  });

  describe("text import answers", () => {
    const pasted = "2 eggs. Whisk.";
    const submit = async (error: ApiError) => {
      render(<ImportScreen api={mockApi({ importText: vi.fn().mockRejectedValue(error) })} initialMode="text" />);
      fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: pasted } });
      fireEvent.click(screen.getByRole("button", { name: "Read the text" }));
    };
    const keptText = () => expect((screen.getByLabelText("Recipe text") as HTMLTextAreaElement).value).toBe(pasted);

    it("422 ai_disabled says AI is off and offers typing it in", async () => {
      await submit(fail(422, "ai_disabled"));
      expect(await screen.findByText("AI is switched off")).toBeTruthy();
      expect(screen.getByText("Reading pasted text needs AI, and none is set up. You can type the recipe in instead.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Type it in" }).getAttribute("href")).toBe("/recipes/new");
      keptText();
    });

    it("422 no_recipe_found says so, without offering to paste again", async () => {
      await submit(fail(422, "no_recipe_found"));
      expect(await screen.findByText("No recipe found in that text")).toBeTruthy();
      expect(screen.getByText(/ingredients and some steps/)).toBeTruthy();
      expect(screen.queryByText(/that page/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Paste the recipe text instead" })).toBeNull();
      expect(screen.getByRole("link", { name: "Type it in" })).toBeTruthy();
      keptText();
    });

    it("413 too_large says the text is too big and keeps it", async () => {
      await submit(fail(413, "too_large"));
      expect(await screen.findByText("That text is too big")).toBeTruthy();
      expect(screen.getByText(/Text over 1 MB can’t be imported/)).toBeTruthy();
      keptText();
    });

    it("502 ai_error shows the server message and lets the user retry", async () => {
      await submit(fail(502, "ai_error", "The AI service did not answer."));
      expect(await screen.findByText("The import failed")).toBeTruthy();
      expect(screen.getByText("The AI service did not answer.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      keptText();
    });

    it("400 validation shows the server message under the text box", async () => {
      await submit(fail(400, "validation", "text: Paste the recipe text first."));
      expect(await screen.findByText("Paste the recipe text first.")).toBeTruthy();
      expect(screen.getByLabelText("Recipe text").getAttribute("aria-invalid")).toBe("true");
      keptText();
    });
  });

  it("shows the AI-fallback warning for a link at the top of the review, before the ingredients", async () => {
    const warning = "Read from the page text by AI — check it against the page.";
    render(<ImportScreen api={mockApi({ importUrl: vi.fn().mockResolvedValue(draft({ warnings: [warning] })) })} />);
    importLink();
    const note = await screen.findByText(warning);
    expect(screen.getByText("Check these before saving")).toBeTruthy();
    const eggs = screen.getAllByText("eggs")[0];
    expect(note.compareDocumentPosition(eggs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the stored photos beside an empty form when AI is off, and saves them with the recipe", async () => {
    // The server path (kept for when capabilities say AI is on but the server answers ai_disabled).
    const api = mockApi({
      importPhoto: vi.fn().mockRejectedValue(fail(422, "ai_disabled", "off", { photoImageIds: ["aaa", "bbb"] })),
    });
    render(<ImportScreen api={api} initialMode="photo" />);
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Read the photos" }));

    expect(await screen.findByRole("heading", { name: "Type it in" })).toBeTruthy();
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["/media/aaa.jpg", "/media/bbb.jpg"]);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Gran’s cake" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(api.createRecipe).toHaveBeenCalled());
    expect(api.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ title: "Gran’s cake", sourceType: "photo", photoImageIds: ["aaa", "bbb"] }));
  });

  describe("AI off: keeping photos through /api/media", () => {
    const off = { importCapabilities: vi.fn().mockResolvedValue({ ai: false, provider: "none" }) };
    const choose = (...names: string[]) =>
      fireEvent.change(screen.getByLabelText("Photos"), { target: { files: names.map((n) => new File(["x"], n, { type: "image/jpeg" })) } });

    it("uploads each photo, shows them and saves with photoImageIds and the first as the picture", async () => {
      const uploadMedia = vi
        .fn()
        .mockResolvedValueOnce({ id: "m1", url: "/media/m1.jpg", width: 1, height: 1 })
        .mockResolvedValueOnce({ id: "m2", url: "/media/m2.jpg", width: 1, height: 1 });
      const api = mockApi({ ...off, uploadMedia });
      render(<ImportScreen api={api} initialMode="photo" />);
      await screen.findByText(/AI is off, so the photos cannot be read/);
      choose("a.jpg", "b.jpg");
      fireEvent.click(screen.getByRole("button", { name: "Keep photos and type it in" }));
      expect(await screen.findByRole("heading", { name: "Type it in" })).toBeTruthy();
      expect(api.importPhoto).not.toHaveBeenCalled();
      expect(uploadMedia).toHaveBeenCalledTimes(2);
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Gran’s cake" } });
      fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
      await waitFor(() => expect(api.createRecipe).toHaveBeenCalled());
      expect(api.createRecipe).toHaveBeenCalledWith(expect.objectContaining({ imageId: "m1", photoImageIds: ["m1", "m2"], sourceType: "photo" }));
    });

    it("names the photo that failed and does not re-upload the one that worked on retry", async () => {
      const uploadMedia = vi
        .fn()
        .mockResolvedValueOnce({ id: "m1", url: "/media/m1.jpg", width: 1, height: 1 })
        .mockRejectedValueOnce(fail(415, "unsupported_media", "Use JPEG, PNG or WebP."))
        .mockResolvedValueOnce({ id: "m2", url: "/media/m2.jpg", width: 1, height: 1 });
      const api = mockApi({ ...off, uploadMedia });
      render(<ImportScreen api={api} initialMode="photo" />);
      await screen.findByText(/AI is off, so the photos cannot be read/);
      choose("a.jpg", "b.gif");
      fireEvent.click(screen.getByRole("button", { name: "Keep photos and type it in" }));
      expect(await screen.findByText(/b\.gif: Use JPEG, PNG or WebP\./)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("heading", { name: "Type it in" })).toBeTruthy();
      expect(uploadMedia).toHaveBeenCalledTimes(3);
    });
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
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByRole("heading", { name: "Check the recipe" })).toBeNull();
    expect(screen.getByLabelText("Recipe link")).toBeTruthy();
  });
});
