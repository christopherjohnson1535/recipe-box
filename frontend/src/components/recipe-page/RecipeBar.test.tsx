import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENER_ACTIONS_ID } from "@/components/ui/SpreadOpener";
import { RecipeBar } from "./RecipeBar";
import { RecipeStateProvider } from "./RecipeState";

function setup() {
  render(
    <RecipeStateProvider id="r1">
      <div id={OPENER_ACTIONS_ID} />
      <RecipeBar id="r1" total={3} />
    </RecipeStateProvider>,
  );
  return document.querySelector<HTMLElement>(".floating-bar")!;
}

afterEach(() => vi.unstubAllGlobals());

describe("RecipeBar", () => {
  it("is hidden until the opener's actions scroll out of view", () => {
    let report: (e: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const bar = setup();
    expect(bar.dataset.shown).toBe("false");
    expect(bar.hasAttribute("inert")).toBe(true);
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    act(() => report([{ isIntersecting: false }]));
    expect(bar.dataset.shown).toBe("true");
    expect(bar.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("link", { name: /start cooking/i }).getAttribute("href")).toBe("/recipes/r1/cook");
    act(() => report([{ isIntersecting: true }]));
    expect(bar.dataset.shown).toBe("false");
  });

  it("shows without IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const bar = setup();
    await waitFor(() => expect(bar.dataset.shown).toBe("true"));
  });
});
