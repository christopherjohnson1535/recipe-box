import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { MadeIt } from "./MadeIt";

afterEach(() => vi.restoreAllMocks());

const captured = () => {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/recipes/r1/cook-log", async ({ request }) => {
      const body = (await request.json()) as { cookedOn: string; note: string };
      bodies.push(body);
      return HttpResponse.json({ id: "c9", recipeId: "r1", madeBy: { id: "u1", displayName: "Chris" }, createdAt: "2026-10-22T12:00:00Z", ...body }, { status: 201 });
    }),
  );
  return bodies;
};

describe("MadeIt (cook mode)", () => {
  it("opens in place, saves today's cook with the note, and confirms", async () => {
    const bodies = captured();
    render(<MadeIt recipeId="r1" show />);
    const open = screen.getByRole("button", { name: "Made it" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    const region = screen.getByRole("region", { name: "Made it" });
    expect(document.activeElement).toBe(region);
    expect((screen.getByLabelText("Cooked on") as HTMLInputElement).value).toBe("2026-10-22"); // the pinned clock's day
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "  More garlic.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save to the log" }));
    expect(await screen.findByText("In the log.")).toBeTruthy();
    expect(bodies).toEqual([{ cookedOn: "2026-10-22", note: "More garlic." }]);
    expect(screen.getByRole("status").textContent).toContain("Today · “More garlic.”");
    expect(document.activeElement?.textContent).toBe("In the log.");
  });

  it("Escape and Not now close the form and give focus back to the button", async () => {
    render(<MadeIt recipeId="r1" show />);
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.keyDown(screen.getByLabelText("What I’d change"), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Made it" })));
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByLabelText("Cooked on")).toBeNull();
  });

  it("refuses a future day and an over-long note before sending anything", () => {
    const bodies = captured();
    render(<MadeIt recipeId="r1" show />);
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.change(screen.getByLabelText("Cooked on"), { target: { value: "2026-10-23" } });
    expect(screen.getByText("Pick a day up to today.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save to the log" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Cooked on"), { target: { value: "2026-10-21" } });
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "x".repeat(2001) } });
    expect(screen.getByText("Keep it to 2,000 characters.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest("form")!);
    expect(bodies).toEqual([]);
  });

  it("shows the server's refusal and keeps the note", async () => {
    server.use(http.post("*/api/recipes/r1/cook-log", () => HttpResponse.json({ error: { code: "not_found", message: "Recipe not found." } }, { status: 404 })));
    render(<MadeIt recipeId="r1" show />);
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "Less salt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to the log" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Recipe not found.");
    expect((screen.getByLabelText("What I’d change") as HTMLTextAreaElement).value).toBe("Less salt");
    expect((screen.getByRole("button", { name: "Save to the log" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps a half-typed note while hidden on an earlier step", () => {
    const { rerender } = render(<MadeIt recipeId="r1" show />);
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "Rest it longer" } });
    rerender(<MadeIt recipeId="r1" show={false} />);
    expect(screen.getByLabelText("What I’d change").closest("[hidden]")).not.toBeNull(); // hidden from everyone
    rerender(<MadeIt recipeId="r1" show />);
    expect((screen.getByLabelText("What I’d change") as HTMLTextAreaElement).value).toBe("Rest it longer");
  });

  it("offline: the form opens and keeps the note, Save is off with the reason, and comes back online", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MadeIt recipeId="r1" show />);
    act(() => void window.dispatchEvent(new Event("offline")));
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "Hotter oven" } });
    const save = screen.getByRole("button", { name: "Save to the log" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(document.getElementById(save.getAttribute("aria-describedby")!)?.textContent).toMatch(/offline.*note stays/i);
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(save.disabled).toBe(false);
    expect((screen.getByLabelText("What I’d change") as HTMLTextAreaElement).value).toBe("Hotter oven");
  });
});
