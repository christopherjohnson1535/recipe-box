import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type RecipeInput } from "@/lib/api";
import { RecipeForm, type RecipeFormProps } from "./RecipeForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
  sessionStorage.clear();
});

const api = () => ({
  listTags: vi.fn().mockResolvedValue([{ name: "dinner", count: 3 }]),
  uploadMedia: vi.fn().mockResolvedValue({ id: "img-1", url: "/media/img-1.jpg", width: 10, height: 10 }),
});

function setup(props: Partial<RecipeFormProps> = {}) {
  const onSubmit = vi.fn<(input: RecipeInput) => Promise<void>>().mockResolvedValue(undefined);
  const mock = api();
  render(<RecipeForm submitLabel="Save recipe" cancelHref="/" onSubmit={onSubmit} api={mock} {...props} />);
  return { onSubmit, mock };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const paste = (el: HTMLElement, text: string) => fireEvent.paste(el, { clipboardData: { getData: () => text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
const values = (re: RegExp) => screen.getAllByLabelText(re).map((e) => (e as HTMLInputElement).value);

describe("RecipeForm", () => {
  it("splits a pasted block into one ingredient per line and strips bullets", () => {
    setup();
    paste(screen.getByLabelText("Ingredient 1"), "1. 2 eggs\n- 100 g flour\n\n• a pinch of salt");
    expect(values(/^Ingredient \d+$/)).toEqual(["2 eggs", "100 g flour", "a pinch of salt"]);
  });

  it("pastes numbered steps as separate steps", () => {
    setup();
    paste(screen.getByLabelText("Step 1"), "1) Mix.\n2) Bake.");
    expect(values(/^Step \d+$/)).toEqual(["Mix.", "Bake."]);
  });

  it("moves an ingredient down with the button and keeps focus on the moved row", () => {
    setup();
    paste(screen.getByLabelText("Ingredient 1"), "a\nb\nc");
    fireEvent.click(screen.getByRole("button", { name: "Move ingredient 1 down" }));
    expect(values(/^Ingredient \d+$/)).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move ingredient 2 down" }));
  });

  it("saves what was typed, with sections and tags, and keeps the source type", async () => {
    const { onSubmit } = setup({ initial: { title: "", sourceType: "link", photoImageIds: ["p1"] } });
    type("Title", "  Pancakes ");
    type("Ingredient 1", "flour");
    fireEvent.click(screen.getByRole("button", { name: "Start a section at ingredient 1" }));
    type("Section heading above ingredient 1", "Batter");
    type("Step 1", "Whisk.");
    type("Prep (min)", "10");
    const tags = screen.getByLabelText("Tags");
    fireEvent.change(tags, { target: { value: "Breakfast, quick" } });
    fireEvent.keyDown(tags, { key: "Enter" });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "Pancakes",
      description: "",
      ingredients: [{ text: "flour", section: "Batter" }],
      steps: [{ text: "Whisk.", section: null }],
      servings: null,
      prepMinutes: 10,
      cookMinutes: null,
      totalMinutes: null,
      notes: "",
      sourceUrl: null,
      sourceName: null,
      sourceType: "link",
      imageId: null,
      photoImageIds: ["p1"],
      tags: ["breakfast", "quick"],
    });
  });

  it("asks for a title without calling the API", () => {
    const { onSubmit } = setup();
    save();
    expect(screen.getByText("Give the recipe a title.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an API validation error on its field and focuses it", async () => {
    const { onSubmit } = setup({ initial: { title: "Soup" } });
    onSubmit.mockRejectedValue(new ApiError(400, "validation", "prepMinutes: must be 0 or more."));
    type("Prep (min)", "5"); // the client allows it; the server's message still lands on the field
    save();
    expect(await screen.findByText("must be 0 or more.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Prep (min)")));
  });

  it("shows other errors at the top and lets the user try again", async () => {
    const { onSubmit } = setup({ initial: { title: "Soup" } });
    onSubmit.mockRejectedValue(new ApiError(0, "network", "Can’t reach the Recipe Box server."));
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Can’t reach the Recipe Box server.");
    expect((screen.getByRole("button", { name: "Save recipe" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("uploads a photo, previews it and sends its id", async () => {
    const { onSubmit, mock } = setup({ initial: { title: "Soup" } });
    const file = new File(["x"], "soup.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Recipe photo"), { target: { files: [file] } });
    });
    expect(mock.uploadMedia).toHaveBeenCalledWith(file);
    expect((await screen.findByAltText("Preview of the recipe photo")).getAttribute("src")).toBe("/media/img-1.jpg");
    save();
    await waitFor(() => expect(onSubmit.mock.calls[0][0].imageId).toBe("img-1"));
  });

  it("shows an upload error", async () => {
    const { mock } = setup();
    mock.uploadMedia.mockRejectedValue(new ApiError(415, "unsupported_media", "That file is not an image."));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Recipe photo"), { target: { files: [new File(["x"], "a.txt")] } });
    });
    expect((await screen.findByRole("alert")).textContent).toBe("That file is not an image.");
  });

  it("shows draft warnings", () => {
    setup({ initial: { title: "Draft", warnings: ["No steps found."] } });
    expect(screen.getByText("No steps found.")).toBeTruthy();
  });

  it("confirms before cancelling changes, and cancels straight away when clean", () => {
    setup();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancel);
    expect(push).toHaveBeenCalledWith("/");

    push.mockReset();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    type("Title", "Changed");
    fireEvent.click(cancel);
    expect(confirm).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(cancel);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("warns on reload only while there are unsaved changes", () => {
    setup();
    const event = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(event()).toBe(false);
    type("Title", "Changed");
    expect(event()).toBe(true);
  });

  it("does not warn after a successful save", async () => {
    setup({ initial: { title: "Soup" } });
    type("Title", "Soup 2");
    save();
    await waitFor(() => expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true));
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
  it("does not submit when Enter is pressed in a section heading", () => {
    const { onSubmit } = setup();
    type("Title", "T");
    fireEvent.click(screen.getByRole("button", { name: "Start a section at ingredient 1" }));
    const heading = screen.getByLabelText("Section heading above ingredient 1");
    expect(fireEvent.keyDown(heading, { key: "Enter" })).toBe(false); // default prevented
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores Enter that confirms an IME choice", () => {
    setup();
    fireEvent.keyDown(screen.getByLabelText("Ingredient 1"), { key: "Enter", isComposing: true });
    expect(values(/^Ingredient \d+$/)).toEqual([""]);
  });

  it("shows a blank heading after a section as ending it, and the remove button says it joins", () => {
    setup({ initial: { title: "t", ingredients: [{ text: "a", section: "Sauce" }, { text: "b", section: null }] } });
    const heading = screen.getByLabelText("Section heading above ingredient 2");
    expect(heading.getAttribute("placeholder")).toContain("No heading");
    expect(screen.getByRole("button", { name: "Join ingredient 2 to the previous section" })).toBeTruthy();
  });

  it("rejects decimal and out-of-range minutes before sending, and focuses the field", async () => {
    const { onSubmit } = setup();
    type("Title", "T");
    type("Prep (min)", "1.5");
    save();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Prep (min)")));
    type("Prep (min)", "10001");
    save();
    expect(await screen.findByText(/Whole minutes, 0 to 10,000/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers a stashed draft back and restores it", () => {
    sessionStorage.setItem(
      "rb-draft:new",
      JSON.stringify({
        title: "Half typed", description: "", servings: "", prep: "", cook: "", total: "", sourceUrl: "", sourceName: "", notes: "",
        tags: [], tagDraft: "", ingredients: [{ key: "x", text: "salt", heading: null }], steps: [], imageId: null, imageUrl: null,
      }),
    );
    setup();
    expect(screen.getByText("You have unsaved changes from earlier")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Half typed");
    expect(values(/^Ingredient \d+$/)).toEqual(["salt"]);
    sessionStorage.clear();
  });

  it("stashes while dirty and clears the stash after a save", async () => {
    vi.useFakeTimers();
    const { onSubmit } = setup();
    type("Title", "Soup");
    await act(async () => void vi.advanceTimersByTime(500));
    expect(sessionStorage.getItem("rb-draft:new")).toContain("Soup");
    vi.useRealTimers();
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(sessionStorage.getItem("rb-draft:new")).toBeNull());
  });
});
