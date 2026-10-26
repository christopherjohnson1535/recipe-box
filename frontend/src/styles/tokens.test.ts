// @vitest-environment node
// Guards for the three token layers (docs/THEMING.md): every theme defines every semantic token from primitives,
// component tokens point at real semantic tokens, and every theme meets the contrast contract.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import webManifest from "@/app/manifest";
import { PAPER } from "@/lib/edition";

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
// The first definition of each name is the day value; the evening blocks that follow override some of them.
const components = Object.fromEntries(
  [...read("components.css").matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].reverse().map((m) => [m[1], m[2].trim()]),
);
const motion = decls(read("motion.css"));
// Component tokens that are not colours, so they don't point at a semantic token.
const NON_COLOUR = ["--photo-filter", "--bar-radius"];
// Decorative tokens that sit behind or between content and carry no text or state, so they need no contrast pairing.
const DECORATIVE: Record<string, string> = {
  "--skeleton-bg": "loading placeholder block behind content that has not arrived; aria-hidden, carries nothing",
  "--skeleton-shine": "the soft highlight in the middle of a skeleton block (static); decoration only",
};
// The edition selectors: evening applies under the attribute, and under a dark device when no attribute is set.
const EVENING_ATTR = /:root\[data-theme="evening"\]\s*\{([^}]*)\}/;
const EVENING_DEVICE = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}\s*\}/;

/** The declarations of the evening block selected by attribute and of the one selected by the device scheme. */
function eveningBlocks(css: string) {
  const attr = css.match(EVENING_ATTR)?.[1];
  const device = css.match(EVENING_DEVICE)?.[1];
  return { attr: decls(attr ?? ""), device: decls(device ?? ""), found: Boolean(attr && device), raw: [attr ?? "", device ?? ""] };
}
const semanticNames = Object.keys(themes.day).sort();

/** Resolves a semantic or component token to a hex colour in one theme. */
function hex(theme: string, token: string): string {
  // Evening can re-point a component token (timer chips, the floating bar) in components.css.
  const override = theme === "evening" ? eveningBlocks(read("components.css")).attr[token] : undefined;
  const semantic = token.startsWith("--color-") ? token : ref(override ?? components[token] ?? "");
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
  ["--button-danger-text-fg", "--color-paper"],
  ["--button-danger-text-fg", "--color-paper-deep"], // Remove in a grocery panel, Disconnect in a member row
  ["--button-danger-text-hover", "--color-paper"],
  ["--button-danger-text-hover", "--color-paper-deep"],
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
  ["--stamp-fg", "--color-paper"], // the save stamp carries text
  ["--qty-fg", "--panel-bg"], // ingredient quantities
  ["--timer-fg", "--timer-bg"], // timer chips in a step
  ["--bar-fg", "--bar-bg"], // the floating bar
  ["--bar-action-fg", "--bar-action-bg"], // its Start cooking link
  ["--qty-fg", "--target-bg"], // the ingredient row a step link jumped to
  ["--color-ink", "--target-bg"],
  ["--color-on-attention", "--color-attention"], // the ? mark
  ["--color-on-stage", "--color-stage"], // darkroom caption and domain card
  ["--color-danger-hover", "--color-paper"],
  ["--color-on-danger", "--color-danger"], // the danger button
  ["--color-on-danger", "--color-danger-hover"],
  ["--color-on-band", "--color-band"], // the charcoal top band and inverse panels (#120)
  ["--color-band-accent", "--color-band"], // saffron on the band: active link, counts
  ["--cook-on-dish-1", "--cook-dish-1"], // the initial in a filled dish mark (cook together)
  ["--cook-on-dish-3", "--cook-dish-3"],
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
  ["--button-primary-fg", "--button-primary-bg"], // the focus ring inside the checked ½× / 1× / 2× segment is drawn in this colour
  ["--button-ghost-underline", "--color-paper"],
  ["--button-danger-text-underline", "--color-paper"],
  ["--button-danger-text-underline", "--color-paper-deep"],
  ["--button-secondary-border", "--color-paper"],
  ["--chip-underline-selected", "--color-paper"],
  ["--nav-underline-active", "--color-paper"],
  ["--alert-rule-error", "--alert-bg"],
  ["--progress-fg", "--alert-bg"],
  ["--editor-heading-rule", "--color-paper"],
  ["--focus-ring", "--color-paper"],
  ["--focus-ring", "--color-paper-deep"],
  ["--spot-line", "--color-paper"], // spot icons are graphics, 3:1
  ["--spot-detail", "--color-paper"],
  ["--card-underline", "--color-paper"], // the drawn title underline
  ["--strike-fg", "--panel-bg"], // the drawn line through a ticked ingredient
  ["--mention-line", "--color-paper"], // dotted underline on an ingredient named in a step
  ["--bar-focus", "--bar-bg"],
  ["--color-attention", "--color-stage"], // scan line and region boxes on the dark ground
  ["--color-band-accent", "--color-band"], // active underline and focus ring on the band
  ["--color-on-band", "--color-band"],
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
    expect(day).not.toContain("data-theme");
    expect(evening).not.toContain("@theme");
    const blocks = eveningBlocks(evening);
    expect(blocks.found, "evening.css needs the data-theme block and the :root:not([data-theme]) dark-device block").toBe(true);
    expect(blocks.attr["--color-paper"]).toBeDefined();
    for (const raw of blocks.raw) expect(raw).toMatch(/color-scheme:\s*dark/);
  });

  it("evening applies the same values by attribute and by device, and a chosen day edition beats a dark device", () => {
    const evening = eveningBlocks(read("themes/evening.css"));
    expect(evening.device).toEqual(evening.attr);
    expect(Object.keys(evening.attr).sort()).toEqual(semanticNames);
    const comp = eveningBlocks(read("components.css"));
    expect(comp.found).toBe(true);
    expect(comp.device).toEqual(comp.attr);
    expect(Object.keys(comp.attr).sort()).toEqual(["--bar-bg", "--bar-fg", "--bar-focus", "--feature-edge", "--photo-filter", "--photo-outline", "--rule-double", "--timer-bg", "--timer-fg"]);
    // The device block only matches when no attribute is set, so data-theme="day" is never overridden.
    for (const css of [read("themes/evening.css"), read("components.css")]) {
      expect(css).not.toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/);
    }
  });

  it("edition.ts paper colours equal the resolved paper token of each theme", () => {
    expect(PAPER.day).toBe(hex("day", "--color-paper"));
    expect(PAPER.evening).toBe(hex("evening", "--color-paper"));
  });

  it("every fg/bg component token has a contrast pairing", () => {
    const paired = new Set([...TEXT, ...UI].flat());
    const unpaired = Object.keys(components).filter((n) => /-(fg|bg)(-[a-z]+)?$/.test(n) && !paired.has(n) && !(n in DECORATIVE));
    expect(unpaired).toEqual([]);
  });

  it("decorative exceptions are real component tokens with a reason", () => {
    for (const [name, reason] of Object.entries(DECORATIVE)) {
      expect(components[name], name).toBeDefined();
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });

  it("themeColor and the manifest match the paper colour of each theme", () => {
    const layout = readFileSync(join(dir, "../app/layout.tsx"), "utf8");
    const themeColor = (scheme: string) =>
      layout.match(new RegExp(`prefers-color-scheme: ${scheme}\\)",\\s*color: "(#[0-9a-f]{6})"`))?.[1];
    expect(themeColor("light")).toBe(hex("day", "--color-paper"));
    expect(themeColor("dark")).toBe(hex("evening", "--color-paper"));
    const manifest = webManifest();
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
    const motionCss = read("motion.css");
    for (const m of motionCss.matchAll(/var\((--[a-z0-9-]+)\)/g)) used.add(m[1]);
    const defined = new Set([...Object.keys(components), ...semanticNames, ...Object.keys(decls(globals)), ...Object.keys(motion)]);
    // Tailwind's own variables (--tw-*) are generated, not declared by us.
    const undefinedTokens = [...used].filter((n) => !defined.has(n) && !n.startsWith("--tw-"));
    expect(undefinedTokens).toEqual([]);
    expect(Object.keys(components).filter((n) => !used.has(n))).toEqual([]);
  });

  it("print inks: where each is safe on day and evening paper", () => {
    // Recorded, not aspirational. text = 4.5:1 (may carry words); graphic = 3:1 (icons, strokes, large marks);
    // decorative = below 3:1, flat colour with no meaning of its own. No semantic token names these inks yet.
    const use = (c: number) => (c >= 4.5 ? "text" : c >= 3 ? "graphic" : "decorative");
    const inks = { "--mustard-500": "#d9a21b", "--fern-700": "#3f6b45", "--tomato-600": "#d2492a" };
    for (const [name, value] of Object.entries(inks)) expect(primitives[name], name).toBe(value);
    const result = Object.fromEntries(
      Object.entries(inks).map(([name, v]) => [
        name,
        { day: use(contrast(v, PAPER.day)), evening: use(contrast(v, PAPER.evening)) },
      ]),
    );
    expect(result).toEqual({
      "--mustard-500": { day: "decorative", evening: "text" }, // 2.09:1 on day paper, 8.03:1 on evening paper
      "--fern-700": { day: "text", evening: "decorative" }, // 5.60:1 on day paper; 2.99:1 on evening paper, a hair under 3
      "--tomato-600": { day: "graphic", evening: "graphic" }, // 4.03:1 and 4.16:1: icons yes, body text no
    });
  });

  it.each(themeFiles.map((f) => f.replace(".css", "")))("%s: text on the attention wash (20% over paper) is at least 4.5:1", (t) => {
    const mix = (a: string, b: string, k: number) =>
      "#" + [1, 3, 5].map((i) => Math.round(k * parseInt(a.slice(i, i + 2), 16) + (1 - k) * parseInt(b.slice(i, i + 2), 16)).toString(16).padStart(2, "0")).join("");
    const wash = mix(hex(t, "--color-attention"), hex(t, "--color-paper"), 0.2);
    for (const fg of ["--color-ink", "--color-accent"]) expect(contrast(hex(t, fg), wash), `${t} ${fg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(themeFiles.map((f) => f.replace(".css", "")))("%s: danger and attention read apart from the accent", (t) => {
    // Hue in degrees, 0-360. Saffron sits near 38 degrees; an error or a "check this" mark must not look like it.
    const hue = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (raw * 60 + 360) % 360;
    };
    const apart = (a: string, b: string) => {
      const diff = Math.abs(hue(hex(t, a)) - hue(hex(t, b)));
      return Math.min(diff, 360 - diff);
    };
    expect(hex(t, "--color-danger")).not.toBe(hex(t, "--color-accent"));
    expect(apart("--color-danger", "--color-accent"), `${t} danger vs accent`).toBeGreaterThanOrEqual(25);
    expect(apart("--color-attention", "--color-accent"), `${t} attention vs accent`).toBeGreaterThanOrEqual(25);
  });

  describe("cook together dish marks (cook mode is always the evening appearance)", () => {
    const dishes = [1, 2, 3, 4];
    const filled = [1, 3];
    const grounds = ["--color-stage", "--color-paper"];
    const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const distance = (a: string, b: string) => Math.hypot(...channels(a).map((v, i) => v - channels(b)[i]));

    it.each(dishes)("dish %i: the mark is at least 3:1 and the initial in it at least 4.5:1 on the cook ground", (n) => {
      for (const ground of grounds) {
        const bg = hex("evening", ground);
        expect(contrast(hex("evening", `--cook-dish-${n}`), bg), `mark on ${ground}`).toBeGreaterThanOrEqual(3);
        // On an outline the initial sits straight on the ground; on a fill, on the dish colour (checked in TEXT above).
        if (!filled.includes(n)) expect(contrast(hex("evening", `--cook-on-dish-${n}`), bg), `initial on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(filled)("dish %i: the initial on the fill is at least 4.5:1 in both appearances", (n) => {
      for (const t of ["day", "evening"]) expect(contrast(hex(t, `--cook-on-dish-${n}`), hex(t, `--cook-dish-${n}`)), t).toBeGreaterThanOrEqual(4.5);
    });

    it("no dish borrows the danger colour (it means an error)", () => {
      for (const t of ["day", "evening"]) for (const n of dishes) expect(hex(t, `--cook-dish-${n}`), `${t} dish ${n}`).not.toBe(hex(t, "--color-danger"));
    });

    it("the four dish colours are apart from each other, and the two that share a fill are clearly apart", () => {
      for (const a of dishes) for (const b of dishes.filter((x) => x > a)) {
        const apart = distance(hex("evening", `--cook-dish-${a}`), hex("evening", `--cook-dish-${b}`));
        const sameFill = filled.includes(a) === filled.includes(b); // a fill and an outline are also told apart by that
        expect(apart, `dish ${a} vs ${b}`).toBeGreaterThanOrEqual(sameFill ? 100 : 50);
      }
    });
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
