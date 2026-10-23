import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Arrive, markArrived, resetArrivals } from "./Arrive";


describe("Arrive", () => {
  beforeEach(() => resetArrivals());

  it("plays the first time a key is shown, then not on a revisit", () => {
    const first = render(<Arrive arriveKey="home" />);
    expect(first.container.firstElementChild?.getAttribute("data-arrive")).toBe("play");
    first.unmount();
    const again = render(<Arrive arriveKey="home" />);
    expect(again.container.firstElementChild?.getAttribute("data-arrive")).toBe("done");
  });

  it("server HTML carries an early script that marks an already-shown key done; client renders do not", () => {
    const html = renderToString(<Arrive arriveKey="recipe:a<b" />);
    expect(html).toContain("<script>");
    expect(html).toContain("rb-arrived:recipe:a\\u003cb");
    expect(html).not.toContain("a<b\"");
    const { container } = render(<Arrive arriveKey="home" />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("stops marking play once the animations have finished", () => {
    vi.useFakeTimers();
    const { container } = render(<Arrive arriveKey="late" />);
    expect(container.firstElementChild?.getAttribute("data-arrive")).toBe("play");
    vi.advanceTimersByTime(2500);
    expect(container.firstElementChild?.getAttribute("data-arrive")).toBe("done");
  });

  it("skips a page a card already morphed into, and keys are independent", () => {
    markArrived("recipe:1");
    const a = render(<Arrive arriveKey="recipe:1" />);
    expect(a.container.firstElementChild?.getAttribute("data-arrive")).toBe("done");
    const b = render(<Arrive arriveKey="recipe:2" />);
    expect(b.container.firstElementChild?.getAttribute("data-arrive")).toBe("play");
  });

  it("falls back to memory when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Arrive arriveKey="x" />).unmount();
    const again = render(<Arrive arriveKey="x" />);
    expect(again.container.firstElementChild?.getAttribute("data-arrive")).toBe("done");
    vi.restoreAllMocks();
  });
});
