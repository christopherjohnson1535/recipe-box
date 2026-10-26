import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { GroceryView } from "./GroceryView";
import type { GoogleStatus } from "@/lib/api";
import type { GroceryItem, GroceryList } from "./types";

const item = (over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem => ({
  amounts: [], section: "other", checked: false, manual: false, staple: false, recipeIds: [], ...over,
});
const stock = (): GroceryItem[] => [
  item({ id: "i-garlic", name: "garlic", section: "produce", amounts: [{ quantity: "2", unit: "clove" }] }),
  item({ id: "i-milk", name: "milk", section: "fridge", amounts: [{ quantity: "1", unit: "cup" }, { quantity: "2", unit: "tbsp" }] }),
  item({ id: "i-done", name: "bread", section: "pantry", checked: true }),
  item({ id: "i-salt", name: "salt", section: "pantry", staple: true }),
];
const MILK_LIST = "Groceries\n\nProduce\n- 2 cloves garlic\n\nFridge\n- 1 cup + 2 tbsp milk";

const serve = (items = stock(), google?: GoogleStatus | "fails") => {
  const list: GroceryList = { id: "g1", updatedAt: "2026-01-01T00:00:00Z", recipes: [], items };
  const statusCalls = { n: 0 };
  server.use(
    http.get("*/api/grocery", () => HttpResponse.json(list)),
    http.get("*/api/integrations/google", () => {
      statusCalls.n++;
      return google === "fails" ? HttpResponse.json({ error: { code: "internal", message: "no" } }, { status: 500 }) : HttpResponse.json(google ?? { configured: false, connected: false, connectedAt: null });
    }),
  );
  return statusCalls;
};
const open = async () => {
  render(<GroceryView />);
  await screen.findByRole("heading", { level: 2, name: "Produce" });
};
const configured = (connected: boolean): GoogleStatus => ({ configured: true, connected, connectedAt: connected ? "2026-10-20T10:00:00Z" : null });
const tasksButton = () => screen.queryByRole("button", { name: /Send to Google Tasks|Sending…/ }) as HTMLButtonElement | null;
const sendFails = (status: number, code: string, message: string) =>
  server.use(http.post("*/api/grocery/export/google-tasks", () => HttpResponse.json({ error: { code, message } }, { status })));

const setNavigator = (key: "share" | "clipboard", value: unknown) => Object.defineProperty(navigator, key, { value, configurable: true });
const setExec = (fn: unknown) => Object.defineProperty(document, "execCommand", { value: fn, configurable: true });
afterEach(() => {
  vi.restoreAllMocks(); // the offline tests spy on navigator.onLine
  vi.unstubAllGlobals();
  delete (navigator as unknown as Record<string, unknown>).share;
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  delete (navigator as unknown as Record<string, unknown>).standalone;
  delete (document as unknown as Record<string, unknown>).execCommand;
});
const sendArea = () => within(screen.getByRole("group", { name: "Send to…" }));

describe("Share or Copy", () => {
  it("offers Copy where the browser has no share sheet, and copies the unticked items", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    serve();
    await open();
    expect(screen.queryByRole("button", { name: "Share list" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    expect(await within(screen.getByRole("group", { name: "Send to…" })).findByText("Copied.")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(MILK_LIST);
  });

  it("includes the staples when the page shows them", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Show staples/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(`${MILK_LIST}\n\nPantry\n- salt`);
  });

  it("copies by selection when the page has no clipboard API (plain http on the LAN)", async () => {
    let copied = "";
    setExec(
      vi.fn(() => {
        const box = document.activeElement as HTMLTextAreaElement;
        copied = box.value.slice(box.selectionStart, box.selectionEnd);
        return true;
      }),
    );
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    expect(await sendArea().findByText("Copied.")).toBeTruthy();
    expect(copied).toBe(MILK_LIST);
    expect(sendArea().queryByRole("textbox")).toBeNull();
  });

  it("shows the list, selected, when nothing on the device will copy it", async () => {
    setNavigator("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    setExec(vi.fn(() => false));
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    expect(await sendArea().findByText("Select and copy the list below.")).toBeTruthy();
    const box = sendArea().getByRole("textbox", { name: "The list, to copy" }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe(MILK_LIST);
    await waitFor(() => expect(document.activeElement).toBe(box)); // focus and selection are set in an effect, after the commit
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe(MILK_LIST);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("forgets a message once the list changes underneath it", async () => {
    setNavigator("clipboard", { writeText: vi.fn().mockResolvedValue(undefined) });
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    await sendArea().findByText("Copied.");
    fireEvent.click(screen.getByRole("button", { name: /Show staples/ }));
    expect(sendArea().queryByText("Copied.")).toBeNull();
  });

  it("says the staples are left out until they are shown", async () => {
    serve();
    await open();
    expect(sendArea().getByText(/Staples are left out/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Show staples/ }));
    expect(sendArea().queryByText(/Staples are left out/)).toBeNull();
  });

  it("offers Share instead of Copy when the browser has a share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator("share", share);
    serve();
    await open();
    expect(screen.queryByRole("button", { name: "Copy list" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Share list" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Groceries", text: MILK_LIST }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is quiet when the person closes the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    setNavigator("share", share);
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Share list" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("copies the list instead when the share sheet fails for another reason", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    setNavigator("share", vi.fn().mockRejectedValue(new DOMException("No", "NotAllowedError")));
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Share list" }));
    expect(await sendArea().findByText("Couldn’t open the share sheet, so the list was copied.")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(MILK_LIST);
  });

  it("shows the list to select when the share sheet fails and nothing copies", async () => {
    setNavigator("share", vi.fn().mockRejectedValue(new DOMException("No", "NotAllowedError")));
    setExec(vi.fn(() => false));
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Share list" }));
    expect(await sendArea().findByRole("textbox", { name: "The list, to copy" })).toBeTruthy();
  });

  it("is quiet when a second tap lands while the share sheet is open", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Busy", "InvalidStateError"));
    setNavigator("share", share);
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Share list" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => undefined);
    expect(sendArea().queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is not shown when there is nothing on the list at all", async () => {
    serve([]);
    render(<GroceryView />);
    await screen.findByText("Nothing on the list yet");
    expect(screen.queryByRole("group", { name: "Send to…" })).toBeNull();
  });
});

describe("Send to Google Tasks", () => {
  it("is absent when the server has no Google set up, or can't be asked", async () => {
    serve();
    await open();
    expect(screen.queryByText(/Google Tasks/)).toBeNull();
  });

  it("stays absent when the status can't be loaded", async () => {
    const calls = serve(stock(), "fails");
    await open();
    await waitFor(() => expect(calls.n).toBe(1));
    expect(screen.queryByText(/Google Tasks/)).toBeNull();
  });

  it("asks for the status once, however many times the list refreshes", async () => {
    const calls = serve(stock(), configured(true));
    await open();
    await screen.findByRole("button", { name: "Send to Google Tasks" });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => undefined);
    expect(calls.n).toBe(1);
  });

  it("leads to Google's consent page when not connected, and says so first", async () => {
    serve(stock(), configured(false));
    await open();
    const link = await screen.findByRole("link", { name: "Connect Google Tasks" });
    expect(link.getAttribute("href")).toBe("/api/integrations/google/connect");
    const hint = screen.getByText(/Google’s consent page, then back to Settings/);
    expect(link.getAttribute("aria-describedby")).toBe(hint.id);
    expect(tasksButton()).toBeNull();
  });

  it("tells a Home Screen app to connect from the browser, with Connect still there", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    serve(stock(), configured(false));
    await open();
    const link = await screen.findByRole("link", { name: "Connect Google Tasks" });
    const hint = screen.getByText(/Connect once from Safari \(or your browser\), not the Home Screen app: open Settings there\. After that, sending works here too\./);
    expect(link.getAttribute("aria-describedby")).toBe(hint.id);
    expect(screen.queryByText(/consent page/)).toBeNull();
  });

  it("sends with the staples setting, keeps focus while sending, says so, and reports the counts", async () => {
    serve(stock(), configured(true));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/grocery/export/google-tasks", async ({ request }) => {
        bodies.push(await request.json());
        await gate;
        return HttpResponse.json({ taskListTitle: "Groceries", sections: 2, items: 3 });
      }),
    );
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /Show staples/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    await waitFor(() => expect(tasksButton()?.textContent).toBe("Sending…"));
    expect(tasksButton()?.getAttribute("aria-disabled")).toBe("true");
    expect(tasksButton()?.disabled).toBe(false); // so keyboard focus stays on it
    expect(sendArea().getByRole("status").textContent).toBe("Sending to Google Tasks…");
    fireEvent.click(tasksButton()!); // a second tap does nothing
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to Google Tasks" })).toBeTruthy());
    expect(screen.getByText("Sent 3 items to Google Tasks › Groceries.")).toBeTruthy();
    expect(bodies).toEqual([{ includeStaples: true }]);
    expect(sendArea().getByRole("status").textContent).not.toContain("Sending");
  });

  it("sends without staples by default and speaks of one item in the singular", async () => {
    serve(stock(), configured(true));
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/grocery/export/google-tasks", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ taskListTitle: "Groceries", sections: 1, items: 1 });
      }),
    );
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect(await screen.findByText("Sent 1 item to Google Tasks › Groceries.")).toBeTruthy();
    expect(bodies).toEqual([{ includeStaples: false }]);
  });

  it("says when there was nothing to send", async () => {
    serve(stock(), configured(true));
    server.use(http.post("*/api/grocery/export/google-tasks", () => HttpResponse.json({ taskListTitle: "Groceries", sections: 0, items: 0 })));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect(await screen.findByText(/Nothing to send/)).toBeTruthy();
  });

  it("offers to reconnect when Google no longer accepts the connection", async () => {
    serve(stock(), configured(true));
    sendFails(409, "google_not_connected", "Connect Google Tasks first.");
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn’t connected");
    const link = alert.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/api/integrations/google/connect");
    await waitFor(() => expect(document.activeElement).toBe(link)); // moved in an effect; the Send button that had focus is gone
    // the button now reads as the connect link too
    expect(screen.getByRole("link", { name: "Connect Google Tasks" })).toBeTruthy();
    expect(tasksButton()).toBeNull();
  });

  it("says the send is already running", async () => {
    serve(stock(), configured(true));
    sendFails(409, "conflict", "A send to Google Tasks is already running.");
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A send to Google Tasks is already running.");
    expect(tasksButton()?.disabled).toBe(false);
  });

  it("passes on Google's own error message", async () => {
    serve(stock(), configured(true));
    sendFails(502, "google_error", "Google Tasks failed part way. Send it again.");
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Send it again");
  });

  it("tells the person to ask the admin when the server has Google switched off", async () => {
    serve(stock(), configured(true));
    sendFails(422, "google_disabled", "Google Tasks is not configured.");
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ask the household admin");
  });

  it("explains a network failure", async () => {
    serve(stock(), configured(true));
    server.use(http.post("*/api/grocery/export/google-tasks", () => HttpResponse.error()));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Send to Google Tasks" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Can’t reach the Recipe Box server");
  });

  it("is switched off with the offline reason while offline", async () => {
    serve(stock(), configured(true));
    await open();
    await screen.findByRole("button", { name: "Send to Google Tasks" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(tasksButton()?.disabled).toBe(true);
    expect(tasksButton()?.getAttribute("aria-describedby")).toBe("groceries-offline");
  });

  it("shows Connect switched off while offline when not connected", async () => {
    serve(stock(), configured(false));
    await open();
    await screen.findByRole("link", { name: "Connect Google Tasks" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const button = screen.getByRole("button", { name: "Connect Google Tasks" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toContain("groceries-offline");
    expect(button.getAttribute("aria-describedby")).toContain(screen.getByText(/consent page/).id);
  });
});
