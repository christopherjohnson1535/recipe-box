// @vitest-environment node
// Guard: only src/components/ui/* decides how things look. Pages, layouts and the other components arrange
// ui components with layout utilities (flex, grid, gap, padding, widths); colour, type, borders and the helper
// classes live in ui. See docs/UI.md, "Where styling lives".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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

/** Returns the classes in a file that aren't layout, plus any inline style or ui-internal import. */
function violations(code: string): string[] {
  const found: string[] = [];
  if (/\sstyle=\{/.test(code)) found.push("style={…}");
  if (/from ["'][^"']*\/ui\/cx["']/.test(code)) found.push("imports ui/cx");
  for (const m of code.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    const strings = m[1] !== undefined ? [m[1]] : [...m[2].matchAll(/["'`]([^"'`]*)["'`]/g)].map((s) => s[1]);
    for (const cls of strings.join(" ").split(/\s+/).filter(Boolean)) {
      const bare = cls.replace(/^([a-z-]+:)+/, "").replace(/^-/, "");
      if (!LAYOUT.test(bare)) found.push(cls);
    }
  }
  return found;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "ui" ? [] : files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("pages don't style themselves", () => {
  it("the checker accepts layout and rejects styling", () => {
    expect(violations('<div className="mx-auto flex max-w-page flex-col gap-8 px-gutter sm:pt-14 -mx-gutter" />')).toEqual([]);
    expect(violations('<p className="label text-ink-muted italic" />')).toEqual(["label", "text-ink-muted", "italic"]);
    expect(violations('<div className={cx("border-b border-rule", x && "bg-paper-deep")} />')).toEqual([
      "border-b",
      "border-rule",
      "bg-paper-deep",
    ]);
    expect(violations('import { cx } from "@/components/ui/cx";')).toEqual(["imports ui/cx"]);
    expect(violations('<img className="aspect-[3/2] w-full" />')).toEqual(["aspect-[3/2]"]);
    expect(violations('<div style={{ color: "red" }} />')).toEqual(["style={…}"]);
  });

  it.each(files(join(src, "app")).concat(files(join(src, "components"))).map((f) => relative(src, f)))(
    "%s uses only ui components and layout utilities",
    (file) => {
      expect(violations(readFileSync(join(src, file), "utf8"))).toEqual([]);
    },
  );
});
