import { describe, expect, it } from "vitest";
import {
  addTags,
  fromItems,
  insertAfter,
  moveRow,
  newRow,
  pasteLines,
  removeRow,
  setHeading,
  splitLines,
  toItems,
} from "./list-model";

const texts = (rows: { text: string }[]) => rows.map((r) => r.text);

describe("sections <-> rows", () => {
  const items = [
    { text: "flour", section: null },
    { text: "milk", section: "For the sauce" },
    { text: "butter", section: "For the sauce" },
    { text: "salt", section: null },
  ];

  it("round-trips items, including a section that ends", () => {
    const rows = fromItems(items);
    expect(rows.map((r) => r.heading)).toEqual([null, "For the sauce", null, ""]);
    expect(toItems(rows)).toEqual(items);
  });

  it("drops blank rows but keeps their heading for the next item", () => {
    const rows = [newRow("a"), newRow("", "Topping"), newRow("b")];
    expect(toItems(rows)).toEqual([
      { text: "a", section: null },
      { text: "b", section: "Topping" },
    ]);
  });

  it("treats an empty heading as no section", () => {
    expect(toItems(setHeading([newRow("a", "X"), newRow("b")], 0, ""))).toEqual([
      { text: "a", section: null },
      { text: "b", section: null },
    ]);
  });
});

describe("splitLines", () => {
  it("strips bullets, numbering and blank lines", () => {
    expect(splitLines("1. Mix\n2) Bake\n\n- Cool\n• Serve\r\n(5) Eat\n  * Enjoy ")).toEqual([
      "Mix",
      "Bake",
      "Cool",
      "Serve",
      "Eat",
      "Enjoy",
    ]);
  });

  it("keeps quantities that look like numbers", () => {
    expect(splitLines("2 eggs\n1/2 cup milk\n1.5 kg flour")).toEqual(["2 eggs", "1/2 cup milk", "1.5 kg flour"]);
  });
});

describe("editing rows", () => {
  const rows = () => [newRow("a", "One"), newRow("b"), newRow("c", "Two")];

  it("moves texts but leaves headings in place", () => {
    const moved = moveRow(rows(), 1, 1);
    expect(texts(moved)).toEqual(["a", "c", "b"]);
    expect(moved.map((r) => r.heading)).toEqual(["One", null, "Two"]);
  });

  it("ignores a move off either end", () => {
    const r = rows();
    expect(moveRow(r, 0, -1)).toBe(r);
    expect(moveRow(r, 2, 1)).toBe(r);
  });

  it("hands a removed row's heading to the next row", () => {
    const next = removeRow(rows(), 0);
    expect(next.map((r) => [r.text, r.heading])).toEqual([["b", "One"], ["c", "Two"]]);
  });

  it("inserts after a row and returns the new key", () => {
    const { rows: next, focus } = insertAfter(rows(), 0);
    expect(next[1].key).toBe(focus);
    expect(next).toHaveLength(4);
  });

  it("pastes into an empty row, or after a filled one", () => {
    const r = [newRow(""), newRow("x")];
    expect(texts(pasteLines(r, 0, ["a", "b", "c"], true).rows)).toEqual(["a", "b", "c", "x"]);
    const after = pasteLines(r, 1, ["a", "b"], false);
    expect(texts(after.rows)).toEqual(["", "x", "a", "b"]);
    expect(after.rows.at(-1)?.key).toBe(after.focus);
  });
});

describe("addTags", () => {
  it("splits on commas, trims, lower-cases and dedupes", () => {
    expect(addTags(["dinner"], " Pasta, dinner ,, Quick ")).toEqual(["dinner", "pasta", "quick"]);
  });
});
