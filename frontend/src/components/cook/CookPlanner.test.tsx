import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookPlan } from "@/lib/api";
import { FIXED_NOW } from "@/test/clock";
import { server } from "@/test/server";
import { CookTogether, type Dish } from "./CookTogether";

const SALAD: Dish = { id: "a", title: "Salad", ingredients: ["2 cups lettuce"], steps: ["Wash the lettuce.", "Dress and serve."] };
const ROAST: Dish = { id: "b", title: "Roast", ingredients: ["1 kg beef"], steps: ["Season the beef.", "Roast for 90 minutes."] };
const step = (recipeId: string, stepIndex: number, startOffsetMin: number | null, note = "") => ({ recipeId, stepIndex, startOffsetMin, startAt: null, note });
const AI_PLAN: CookPlan = {
  source: "ai",
  reason: null,
  totalMinutes: 100,
  serveAt: null,
  steps: [step("b", 0, 0, "Start the roast first; it takes longest."), step("b", 1, 10), step("a", 0, 80, "<b>Prep</b> while it roasts."), step("a", 1, 95)],
};

let asked: unknown[] = [];
function answer(reply: () => Response) {
  asked = [];
  server.use(
    http.post("*/api/cook/plan", async ({ request }) => {
      asked.push(await request.json());
      return reply();
    }),
  );
}
const view = (planning = true) => render(<CookTogether dishes={[SALAD, ROAST]} planning={planning} />);
const planButton = () => screen.queryByRole("button", { name: "Plan the evening" }) as HTMLButtonElement | null;
const listed = () => within(screen.getByRole("list", { name: "Suggested order" })).getAllByRole("listitem").map((li) => li.textContent);
const order = () => JSON.parse(localStorage.getItem("cook-together:a,b") ?? "null")?.order;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-edition-pin");
});

describe("Plan the evening", () => {
  it("is not offered without an AI provider", () => {
    view(false);
    expect(planButton()).toBeNull();
    expect(screen.getByText(/Wash the/)).toBeTruthy(); // manual cooking together is unchanged
  });

  it("previews the AI's order with its notes as plain text, then replaces the order when the cook uses it", async () => {
    answer(() => HttpResponse.json(AI_PLAN));
    view();
    fireEvent.click(planButton()!);
    expect(planButton()!.disabled).toBe(true);
    expect(screen.getByText(/Working out an order for Salad and Roast/)).toBeTruthy();
    await screen.findByRole("list", { name: "Suggested order" });
    expect(asked).toEqual([{ recipeIds: ["a", "b"] }]);
    expect(document.activeElement?.textContent).toBe("Plan the evening"); // the panel's title takes focus
    expect(screen.getByText("Ready to serve 1 hr 40 min after you start.")).toBeTruthy();
    expect(listed()).toEqual([
      "StartRRoastRoast step 1: Season the beef.Start the roast first; it takes longest.",
      "+10 minRRoastRoast step 2: Roast for 90 minutes.",
      "+1 hr 20 minSSaladSalad step 1: Wash the lettuce.<b>Prep</b> while it roasts.",
      "+1 hr 35 minSSaladSalad step 2: Dress and serve.",
    ]);
    expect(document.querySelector("b")).toBeNull(); // a note is text, never markup
    // The cook's own order is untouched until they choose.
    expect(order()).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Use this order" }));
    expect(order()).toEqual([[1, 0], [1, 1], [0, 0], [0, 1]]);
    await waitFor(() => expect(document.activeElement).toBe(planButton())); // focus goes back to the action
    expect(screen.queryByRole("list", { name: "Suggested order" })).toBeNull();
    expect(screen.getByText("Step 1 of 2 · 1st of 4").parentElement?.parentElement?.textContent).toContain("Roast"); // the first step of the new order is current
    expect(screen.getByRole("status").textContent).toContain("Using the suggested order");
    // Still the cook's to change: Reset order goes back to taking turns.
    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));
    expect(order()).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });

  it("shows start times for a serve time", async () => {
    answer(() => HttpResponse.json(AI_PLAN));
    view();
    fireEvent.click(planButton()!);
    await screen.findByRole("list", { name: "Suggested order" });
    fireEvent.change(screen.getByLabelText("Serve at"), { target: { value: "19:00" } });
    // FIXED_NOW is 12:00 UTC (tests run in UTC): serve at 7 PM today, start 100 minutes before.
    expect(screen.getByText("Start at 5:20 PM to serve at 7:00 PM.")).toBeTruthy();
    expect(listed()[0]).toMatch(/^5:20 PM/);
    expect(listed()[3]).toMatch(/^6:55 PM/);
    fireEvent.change(screen.getByLabelText("Serve at"), { target: { value: "" } });
    expect(listed()[0]).toMatch(/^Start/);
  });

  it("warns when the first step would already have started, with the soonest serve time", async () => {
    answer(() => HttpResponse.json(AI_PLAN));
    view();
    fireEvent.click(planButton()!);
    await screen.findByRole("list", { name: "Suggested order" });
    // 12:00 now, a 100-minute plan, serving at 1 PM: it should have started at 11:20.
    fireEvent.change(screen.getByLabelText("Serve at"), { target: { value: "13:00" } });
    const summary = screen.getByText("That start was 40 min ago. The soonest you can serve is 1:40 PM.");
    expect(summary.getAttribute("role")).toBe("status");
    expect(summary.getAttribute("data-warn")).toBe("true");
    fireEvent.change(screen.getByLabelText("Serve at"), { target: { value: "13:40" } });
    expect(screen.getByText("Start at 12:00 PM to serve at 1:40 PM.").getAttribute("data-warn")).toBeNull();
  });

  it("keeps the cook's order on Keep my order", async () => {
    answer(() => HttpResponse.json(AI_PLAN));
    view();
    fireEvent.click(planButton()!);
    await screen.findByRole("list", { name: "Suggested order" });
    fireEvent.click(screen.getByRole("button", { name: "Keep my order" }));
    expect(screen.queryByRole("list", { name: "Suggested order" })).toBeNull();
    expect(order()).toBeUndefined();
    await waitFor(() => expect(document.activeElement).toBe(planButton()));
    expect(screen.getByText(/Wash the/)).toBeTruthy();
    expect(planButton()!.disabled).toBe(false);
  });

  it("says why when the server fell back to taking turns, and the order can still be used", async () => {
    answer(() =>
      HttpResponse.json<CookPlan>({
        source: "roundRobin",
        reason: "The suggested order didn't add up, so the dishes take turns, one step each.",
        totalMinutes: null,
        serveAt: null,
        steps: [step("a", 0, null), step("b", 0, null), step("a", 1, null), step("b", 1, null)],
      }),
    );
    view();
    fireEvent.click(planButton()!);
    expect(await screen.findByText(/didn't add up, so the dishes take turns/)).toBeTruthy();
    expect(screen.queryByLabelText("Serve at")).toBeNull(); // nothing to time
    expect(listed()[0]).toMatch(/^1st/);
    fireEvent.click(screen.getByRole("button", { name: "Use this order" }));
    expect(order()).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });

  it("refuses a plan that does not fit these recipes any more", async () => {
    answer(() => HttpResponse.json<CookPlan>({ ...AI_PLAN, steps: AI_PLAN.steps.slice(1) }));
    view();
    fireEvent.click(planButton()!);
    expect(await screen.findByText(/These recipes changed since this page opened/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use this order" })).toBeNull();
  });

  it("shows the server's reason on a failure and tries again", async () => {
    answer(() => HttpResponse.json({ error: { code: "ai_error", message: "The AI service is busy. Try again in a minute." } }, { status: 502 }));
    view();
    fireEvent.click(planButton()!);
    expect(await screen.findByText("The AI service is busy. Try again in a minute.")).toBeTruthy();
    answer(() => HttpResponse.json(AI_PLAN));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("list", { name: "Suggested order" });
  });

  it("explains a missing provider and a deleted recipe in its own words", async () => {
    answer(() => HttpResponse.json({ error: { code: "ai_disabled", message: "x" } }, { status: 422 }));
    view();
    fireEvent.click(planButton()!);
    expect(await screen.findByText(/needs an AI provider/)).toBeTruthy();
    answer(() => HttpResponse.json({ error: { code: "not_found", message: "x" } }, { status: 404 }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/no longer in the box/)).toBeTruthy();
  });

  it("is disabled offline, with the reason tied to it", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    view();
    const button = planButton()!;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(reason?.textContent).toContain("You’re offline");
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(planButton()!.disabled).toBe(false);
    expect(screen.queryByText(/You’re offline/)).toBeNull();
  });

  it("does not move the hidden step with the arrow keys while the plan is open", async () => {
    answer(() => HttpResponse.json(AI_PLAN));
    view();
    fireEvent.click(planButton()!);
    await screen.findByRole("list", { name: "Suggested order" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Keep my order" }));
    await waitFor(() => expect(screen.getByText("Step 1 of 2 · 1st of 4")).toBeTruthy()); // still the first step
  });
});
