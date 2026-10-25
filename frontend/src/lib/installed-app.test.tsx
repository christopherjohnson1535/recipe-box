import { renderToString } from "react-dom/server";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstalledApp } from "./installed-app";

function Probe() {
  return <p>{useInstalledApp() ? "installed" : "browser"}</p>;
}
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as unknown as Record<string, unknown>).standalone;
});

describe("useInstalledApp", () => {
  it("is false in a browser tab, and when matchMedia is missing", () => {
    expect(render(<Probe />).container.textContent).toBe("browser");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(render(<Probe />).container.textContent).toBe("browser");
  });

  it("is true for display-mode: standalone", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    expect(render(<Probe />).container.textContent).toBe("installed");
  });

  it("is true for iOS's navigator.standalone", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(render(<Probe />).container.textContent).toBe("installed");
  });

  it("is false when rendered on the server, so hydration agrees", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(renderToString(<Probe />)).toContain("browser");
  });
});
