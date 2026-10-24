import { existsSync, readFileSync } from "node:fs";
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

  it("ships an opaque 180px apple-touch-icon and a 32px favicon", () => {
    expect(pngSize("apple-touch-icon.png")).toBe("180x180");
    // IHDR colour type: 2 = RGB, 6 = RGBA (iOS paints transparent corners black).
    expect(readFileSync(join(root, "public", "apple-touch-icon.png")).readUInt8(25)).toBe(2);
    expect(pngSize("icon-32.png")).toBe("32x32");
  });

  it("points every shortcut at an existing app route", () => {
    expect(m.shortcuts?.length).toBeGreaterThan(0);
    for (const s of m.shortcuts ?? []) expect(existsSync(join(root, "src/app/(app)", s.url, "page.tsx")), s.url).toBe(true);
  });
});
