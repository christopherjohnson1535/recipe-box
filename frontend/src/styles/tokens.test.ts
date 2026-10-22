// @vitest-environment node
// Guards for the three token layers (docs/THEMING.md): every theme defines every semantic token from primitives,
// component tokens point at real semantic tokens, and every theme meets the contrast contract.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname);
const read = (f: string) => readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const decls = (css: string) =>
  Object.fromEntries([...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const ref = (value: string) => value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];

const primitives = decls(read("primitives.css"));
const themeFiles = readdirSync(join(dir, "themes")).filter((f) => f.endsWith(".css"));
const themes = Object.fromEntries(
  themeFiles.map((f) => {
    const all = decls(read(`themes/${f}`));
    return [f.replace(".css", ""), all];
  }),
);
const components = decls(read("components.css"));
// Component tokens that are not colours, so they don't point at a semantic token.
const NON_COLOUR = ["--photo-filter"];
const semanticNames = Object.keys(themes.day).sort();

/** Resolves a semantic or component token to a hex colour in one theme. */
function hex(theme: string, token: string): string {
  const semantic = token.startsWith("--color-") ? token : ref(components[token] ?? "");
  if (!semantic) throw new Error(`${token} is not a component token that points at a semantic token`);
  const primitive = ref(themes[theme][semantic] ?? "");
  const value = primitive && primitives[primitive];
  if (!value) throw new Error(`${theme}: ${semantic} does not resolve to a primitive`);
  return value;
}

/** WCAG 2 contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The contract from .tastemaker/style-lock.md, plus each component's own pairings. [foreground, background]
const TEXT: [string, string][] = [
  ["--color-ink", "--color-paper"],
  ["--color-ink", "--color-paper-deep"],
  ["--color-ink-muted", "--color-paper"],
  ["--color-ink-muted", "--color-paper-deep"],
  ["--color-accent", "--color-paper"],
  ["--color-accent", "--color-paper-deep"],
  ["--color-accent-hover", "--color-paper"],
  ["--color-danger", "--color-paper"],
  ["--color-danger", "--color-paper-deep"],
  ["--color-on-accent", "--color-accent"],
  ["--color-on-accent", "--color-accent-hover"],
  ["--button-primary-fg", "--button-primary-bg"],
  ["--button-primary-fg-hover", "--button-primary-bg-hover"],
  ["--button-secondary-fg", "--color-paper"],
  ["--button-secondary-hover", "--color-paper"],
  ["--button-ghost-fg", "--color-paper"],
  ["--button-ghost-hover", "--color-paper"],
  ["--button-danger-fg", "--button-danger-bg"],
  ["--button-danger-fg", "--button-danger-bg-hover"],
  ["--input-fg", "--input-bg"],
  ["--input-placeholder", "--input-bg"],
  ["--chip-fg", "--color-paper"],
  ["--chip-fg-selected", "--color-paper"],
  ["--chip-fg-hover", "--color-paper"],
  ["--drop-cap-fg", "--color-paper"],
  ["--color-ink", "--panel-bg"],
  ["--color-ink-muted", "--panel-bg"],
  ["--nav-fg", "--color-paper"],
  ["--nav-fg-active", "--color-paper"],
  ["--alert-fg", "--alert-bg"],
  ["--toast-fg", "--toast-bg"],
  ["--toast-action-fg", "--toast-bg"],
  ["--alert-title-error", "--alert-bg"],
  ["--kicker-fg", "--color-paper"],
  ["--kicker-fg", "--panel-bg"],
  ["--numeral-fg", "--color-paper"],
  ["--link-fg", "--color-paper"],
  ["--link-fg-hover", "--color-paper"],
  ["--entry-title-hover", "--color-paper"],
  ["--entry-kicker-fg", "--color-paper"],
  ["--selection-fg", "--selection-bg"],
];
// Non-text UI (borders that show a control, focus rings, state underlines): 3:1.
const UI: [string, string][] = [
  ["--color-rule-strong", "--color-paper"],
  ["--color-rule-strong", "--color-paper-deep"],
  ["--input-border", "--input-bg"],
  ["--input-border-invalid", "--input-bg"],
  ["--input-border-hover", "--input-bg"],
  ["--chip-underline-hover", "--color-paper"],
  ["--alert-rule", "--alert-bg"],
  ["--toast-focus", "--toast-bg"],
  ["--button-ghost-underline", "--color-paper"],
  ["--button-secondary-border", "--color-paper"],
  ["--chip-underline-selected", "--color-paper"],
  ["--nav-underline-active", "--color-paper"],
  ["--alert-rule-error", "--alert-bg"],
  ["--progress-fg", "--alert-bg"],
  ["--editor-heading-rule", "--color-paper"],
  ["--focus-ring", "--color-paper"],
  ["--focus-ring", "--color-paper-deep"],
];

describe("design tokens", () => {
  it("has a day theme and at least one other", () => {
    expect(themes.day).toBeDefined();
    expect(themeFiles.length).toBeGreaterThan(1);
  });

  it.each(themeFiles.map((f) => f.replace(".css", "")))("%s defines every semantic token, all from primitives", (t) => {
    expect(Object.keys(themes[t]).sort()).toEqual(semanticNames);
    for (const [name, value] of Object.entries(themes[t])) {
      expect(primitives[ref(value) ?? ""], `${t} ${name}: ${value}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("component tokens all point at semantic tokens", () => {
    for (const [name, value] of Object.entries(components).filter(([n]) => !NON_COLOUR.includes(n))) {
      expect(semanticNames, `${name}: ${value}`).toContain(ref(value));
    }
  });

  it("every pairing in the contract has a test entry for real tokens", () => {
    for (const [fg, bg] of [...TEXT, ...UI]) for (const t of [fg, bg]) expect(() => hex("day", t)).not.toThrow();
  });

  it("each theme file keeps its scope", () => {
    const day = read("themes/day.css");
    const evening = read("themes/evening.css");
    expect(day).toContain("@theme static");
    expect(day).not.toContain("@media");
    expect(evening).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(evening).toMatch(/color-scheme:\s*dark/);
    expect(evening).not.toContain("@theme");
  });

  it("every fg/bg component token has a contrast pairing", () => {
    const paired = new Set([...TEXT, ...UI].flat());
    const unpaired = Object.keys(components).filter((n) => /-(fg|bg)(-[a-z]+)?$/.test(n) && !paired.has(n));
    expect(unpaired).toEqual([]);
  });

  it("themeColor and the manifest match the paper colour of each theme", () => {
    const layout = readFileSync(join(dir, "../app/layout.tsx"), "utf8");
    const themeColor = (scheme: string) =>
      layout.match(new RegExp(`prefers-color-scheme: ${scheme}\\)",\\s*color: "(#[0-9a-f]{6})"`))?.[1];
    expect(themeColor("light")).toBe(hex("day", "--color-paper"));
    expect(themeColor("dark")).toBe(hex("evening", "--color-paper"));
    const manifest = JSON.parse(readFileSync(join(dir, "../../public/manifest.webmanifest"), "utf8"));
    expect(manifest.background_color).toBe(hex("day", "--color-paper"));
    expect(manifest.theme_color).toBe(hex("day", "--color-paper"));
  });

  it("every custom property the ui reads is defined, and every component token is read", () => {
    const uiDir = join(dir, "../components/ui");
    const sources = readdirSync(uiDir)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .map((f) => readFileSync(join(uiDir, f), "utf8"));
    const globals = read("../app/globals.css");
    const used = new Set<string>();
    for (const code of [...sources, globals]) {
      for (const m of code.matchAll(/(?:\(|var\()(--[a-z0-9-]+)\)?/g)) used.add(m[1]);
    }
    const defined = new Set([...Object.keys(components), ...semanticNames, ...Object.keys(decls(globals))]);
    // Tailwind's own variables (--tw-*) are generated, not declared by us.
    const undefinedTokens = [...used].filter((n) => !defined.has(n) && !n.startsWith("--tw-"));
    expect(undefinedTokens).toEqual([]);
    expect(Object.keys(components).filter((n) => !used.has(n))).toEqual([]);
  });

  it("the contrast helper matches WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  for (const t of themeFiles.map((f) => f.replace(".css", ""))) {
    it.each(TEXT)(`${t}: text %s on %s is at least 4.5:1`, (fg, bg) => {
      expect(contrast(hex(t, fg), hex(t, bg))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(UI)(`${t}: control %s on %s is at least 3:1`, (fg, bg) => {
      expect(contrast(hex(t, fg), hex(t, bg))).toBeGreaterThanOrEqual(3);
    });
  }
});
