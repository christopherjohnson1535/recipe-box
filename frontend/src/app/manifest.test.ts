import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const root = join(__dirname, "..", "..");
const m = manifest();
const [icons, shortcutIcons, screenshots] = [
  m.icons ?? [],
  (m.shortcuts ?? []).flatMap((s) => s.icons ?? []),
  m.screenshots ?? [],
];

/** Width and height from the IHDR chunk of a PNG. */
function pngSize(src: string) {
  const b = readFileSync(join(root, "public", src));
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  it("is an installable standalone app rooted at /", () => {
    expect(m).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });
  });

  it("has 192 and 512 any icons and a 512 maskable icon", () => {
    const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && i.purpose === purpose && i.type === "image/png");
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("points every PNG at a file with the declared pixel size", () => {
    const pngs = [...icons, ...shortcutIcons, ...screenshots].filter((i) => i.type === "image/png");
    expect(pngs.length).toBeGreaterThanOrEqual(7);
    for (const i of pngs) expect(pngSize(i.src), i.src).toBe(i.sizes);
  });

  it("serves the SVG icon from public/", () => {
    for (const i of icons.filter((i) => i.type === "image/svg+xml")) expect(readFileSync(join(root, "public", i.src), "utf8")).toContain("<svg");
  });

  it("uses the day paper colour for theme and background", () => {
    const css = readFileSync(join(root, "src/styles/primitives.css"), "utf8");
    const day = readFileSync(join(root, "src/styles/themes/day.css"), "utf8");
    const token = /--color-paper:\s*var\((--[\w-]+)\)/.exec(day)?.[1] ?? "";
    const paper = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1];
    expect(paper).toBeTruthy();
    expect(m.theme_color).toBe(paper);
    expect(m.background_color).toBe(paper);
  });
});
