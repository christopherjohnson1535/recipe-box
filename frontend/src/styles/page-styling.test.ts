// @vitest-environment node
// Guard: only src/components/ui/* decides how things look. Pages, layouts and the other components arrange
// ui components with layout utilities (flex, grid, gap, padding, widths); colour, type, borders and the helper
// classes live in ui. See docs/UI.md, "Where styling lives".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..");

// Layout-only Tailwind classes, after stripping variants (sm:, lg:, max-sm:, focus:) and a leading minus.
const LAYOUT = new RegExp(
  "^(" +
    [
      "flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents|isolate",
      "sr-only|not-sr-only|relative|absolute|fixed|sticky|grow|shrink(-0)?",
      "flex-(1|auto|none|col|row|wrap|nowrap|col-reverse|row-reverse)",
      "(items|justify|self|content|place-items|place-content|place-self)-[a-z]+",
      "gap(-[xy])?-[\\w.]+|space-[xy]-[\\w.]+",
      "[mp][trblxyse]?-([\\w.]+)",
      "(w|h|size|min-w|min-h|max-w|max-h)-[\\w.]+",
      "(grid-cols|grid-rows|col-span|row-span|order|basis)-[\\w]+",
      "overflow(-[xy])?-[a-z]+|(inset|top|right|bottom|left)(-[xy])?-[\\w.]+|z-\\d+",
      "text-(left|center|right|start|end)",
    ].join("|") +
    ")$",
);

const NOT_LITERAL = 'must be a literal className="…"';

/**
 * Returns the classes in a file that aren't layout, plus anything that could carry styling past the check. Outside
 * src/components/ui the only accepted form is a literal double-quoted className="...": no expressions, template
 * literals, single quotes, spreads that carry className, or other class-like props (class, labelClass...).
 */
function violations(code: string): string[] {
  const found: string[] = [];
  if (/\sstyle=\{/.test(code)) found.push("style={…}");
  if (/from ["'][^"']*\/ui\/cx["']/.test(code)) found.push("imports ui/cx");
  const literal = /className="([^"]*)"/g;
  for (const m of code.matchAll(literal)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      const bare = cls.replace(/^([a-z-]+:)+/, "").replace(/^-/, "");
      if (!LAYOUT.test(bare)) found.push(cls);
    }
  }
  // Every other mention of className, or of a class-like prop or helper, is a way around the check.
  const rest = code.replace(literal, "");
  for (const m of rest.matchAll(/\b(className|class(?=\s*[=:])|[a-zA-Z]+Class(?:Name|es)?)\b/g)) {
    found.push(`${m[1]} ${NOT_LITERAL}`);
  }
  return found;
}

const isUi = (path: string) => relative(src, path).split(sep).join("/").startsWith("components/ui/");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    if (isUi(path)) return [];
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

describe("pages don't style themselves", () => {
  it("the checker accepts layout and rejects styling", () => {
    expect(violations('<div className="mx-auto flex max-w-page flex-col gap-8 px-gutter sm:pt-14 -mx-gutter" />')).toEqual([]);
    expect(violations('<p className="label text-ink-muted italic" />')).toEqual(["label", "text-ink-muted", "italic"]);
    expect(violations('import { cx } from "@/components/ui/cx";')).toEqual(["imports ui/cx"]);
    expect(violations('<img className="aspect-[3/2] w-full" />')).toEqual(["aspect-[3/2]"]);
    expect(violations('<div style={{ color: "red" }} />')).toEqual(["style={…}"]);
    expect(violations('<p className="flex gap-2" />')).toEqual([]);
    expect(violations("<ErrorContent {...props} />")).toEqual([]);
    expect(violations("export class ApiError extends Error {} // a JS class")).toEqual([]);
  });

  it("the checker rejects every way around the literal rule", () => {
    const bypasses = [
      '<div className={cx("border-b border-rule", x && "bg-paper-deep")} />',
      "<p className={`text-accent ${x}`} />",
      "<p className='text-accent' />",
      '<p className={"text-accent"} />',
      "<p className={c} />",
      '<p {...{ className: "bg-paper" }} />',
      '<Thing labelClass="bg-paper" />',
      '<Thing class="bg-paper" />',
      'export const rowClass = "text-accent";',
      'const o = { className: "bg-paper" };',
      'const o = { class: "bg-paper" };',
      '<p className={buttonClass("secondary")} />',
    ];
    for (const code of bypasses) expect(violations(code), code).not.toEqual([]);
  });

  it("only components/ui is exempt, not any folder named ui", () => {
    expect(isUi(join(src, "components/ui/Chip.tsx"))).toBe(true);
    expect(isUi(join(src, "app/ui/page.tsx"))).toBe(false);
    expect(isUi(join(src, "components/ui-extra/X.tsx"))).toBe(false);
  });

  it.each(["app", "components", "lib"].flatMap((d) => files(join(src, d))).map((f) => relative(src, f)))(
    "%s uses only ui components and layout utilities",
    (file) => {
      expect(violations(readFileSync(join(src, file), "utf8"))).toEqual([]);
    },
  );
});
