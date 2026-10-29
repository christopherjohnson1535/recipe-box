import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CookLogEntry } from "@/lib/api";
import { server } from "@/test/server";
import { CookLog } from "./CookLog";

afterEach(() => vi.restoreAllMocks());

const entry = (over: Partial<CookLogEntry>): CookLogEntry => ({
  id: "c1", recipeId: "r1", cookedOn: "2026-10-20", note: "", madeBy: { id: "u1", displayName: "Chris" }, createdAt: "2026-10-20T19:00:00Z", ...over,
});
const LOG = [
  entry({ id: "c2", cookedOn: "2026-10-21", note: "Double the sauce.", madeBy: { id: "u2", displayName: "Sam" } }),
  entry({ id: "c1", cookedOn: "2026-10-20" }),
  entry({ id: "c0", cookedOn: "2025-06-01", madeBy: null, note: "Too sweet." }),
];
const member = { id: "u1", role: "member" as const };
const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("CookLog (recipe page)", () => {
  it("lists who and when, newest first, with notes and a count", () => {
    render(<CookLog recipeId="r1" initial={LOG} me={member} />);
    expect(screen.getByRole("heading", { name: "Made it" })).toBeTruthy();
    expect(screen.getByText("Made 3 times")).toBeTruthy();
    expect(rows().map((r) => r.textContent)).toEqual([
      "YesterdaySamDouble the sauce.",
      "Tue, Oct 20YouDelete",
      "Sun, Jun 1, 2025A former memberToo sweet.",
    ]);
    expect(rows()[0].querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-21");
  });

  it("renders full dates on the server, so hydration never disagrees about 'today'", () => {
    const html = renderToString(<CookLog recipeId="r1" initial={LOG} me={member} />);
    expect(html).toContain("Wed, Oct 21, 2026");
    expect(html).not.toContain("Yesterday");
  });

  it("an admin may delete anyone's entry; a member only their own", () => {
    const { unmount } = render(<CookLog recipeId="r1" initial={LOG} me={member} />);
    expect(screen.getAllByRole("button", { name: /^Delete the entry/ })).toHaveLength(1);
    unmount();
    render(<CookLog recipeId="r1" initial={LOG} me={{ id: "u9", role: "admin" }} />);
    expect(screen.getAllByRole("button", { name: /^Delete the entry/ })).toHaveLength(3);
  });

  it("adds an entry in date order and announces it", async () => {
    render(<CookLog recipeId="r1" initial={LOG} me={member} />);
    fireEvent.click(screen.getByRole("button", { name: "Made it" }));
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Log a cook" }));
    fireEvent.change(screen.getByLabelText("Cooked on"), { target: { value: "2026-10-21" } });
    fireEvent.change(screen.getByLabelText("What I’d change"), { target: { value: "Less chilli" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to the log" }));
    expect(await screen.findByText("Logged for Yesterday.")).toBeTruthy();
    expect(screen.getByText("Made 4 times")).toBeTruthy();
    expect(rows()[0].textContent).toBe("YesterdayYouLess chilliDelete"); // same day, recorded later: first
    expect(screen.queryByRole("region", { name: "Log a cook" })).toBeNull();
  });

  it("deletes an entry, and says so when the server refuses", async () => {
    render(<CookLog recipeId="r1" initial={LOG} me={member} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete the entry for Tue, Oct 20 by You" }));
    expect(await screen.findByText("Removed the entry for Tue, Oct 20.")).toBeTruthy();
    expect(rows()).toHaveLength(2);

    server.use(http.delete("*/api/recipes/r1/cook-log/:entryId", () => HttpResponse.json({ error: { code: "forbidden", message: "Only the member who made an entry, or an admin, can delete it." } }, { status: 403 })));
    const { unmount } = render(<CookLog recipeId="r1" initial={[entry({ id: "x" })]} me={member} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete the entry for Tue, Oct 20 by You" }).at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toContain("Only the member who made an entry");
    unmount();
  });

  it("has an empty state, and a quiet note when the log could not be read", () => {
    const { unmount } = render(<CookLog recipeId="r1" initial={[]} me={member} />);
    expect(screen.getByText(/Nobody has logged this one yet/)).toBeTruthy();
    expect(screen.queryByText(/Made \d/)).toBeNull();
    unmount();
    render(<CookLog recipeId="r1" initial={null} me={null} />);
    expect(screen.getByText("The log could not be loaded just now.")).toBeTruthy();
  });

  it("offline: the log still reads, but adding and deleting are off", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<CookLog recipeId="r1" initial={LOG} me={member} />);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(rows()).toHaveLength(3);
    expect((screen.getByRole("button", { name: "Made it" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Delete the entry/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
