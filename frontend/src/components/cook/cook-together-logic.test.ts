import { describe, expect, it } from "vitest";
import {
  bringNext,
  canMove,
  cookTogetherHref,
  dishInitials,
  firstOpen,
  interleave,
  isValidOrder,
  move,
  nextOfDish,
  orderStale,
  parseOrder,
  parseRecipeIds,
  serialiseOrder,
  type DishStep,
} from "./cook-together-logic";
import { TICKS_TTL_MS } from "./cook-logic";

const o = (...pairs: [number, number][]): DishStep[] => pairs.map(([dish, step]) => ({ dish, step }));
const show = (order: readonly DishStep[]) => order.map((e) => `${"ABCD"[e.dish]}${e.step + 1}`).join(" ");

describe("interleave", () => {
  it("goes round-robin", () => expect(show(interleave([2, 2]))).toBe("A1 B1 A2 B2"));
  it("skips dishes that have run out", () => expect(show(interleave([2, 4, 1]))).toBe("A1 B1 C1 A2 B2 B3 B4"));
  it("skips a dish with no steps", () => expect(show(interleave([0, 2]))).toBe("B1 B2"));
  it("keeps one dish in order and handles none", () => {
    expect(show(interleave([3]))).toBe("A1 A2 A3");
    expect(interleave([])).toEqual([]);
  });
});

describe("isValidOrder", () => {
  const counts = [2, 2];
  it("accepts a valid order", () => {
    expect(isValidOrder(interleave(counts), counts)).toBe(true);
    expect(isValidOrder(o([0, 0], [0, 1], [1, 0], [1, 1]), counts)).toBe(true);
  });
  it("rejects a missing, duplicate, out-of-order or out-of-range entry", () => {
    expect(isValidOrder(o([0, 0], [1, 0], [0, 1]), counts)).toBe(false);
    expect(isValidOrder(o([0, 0], [0, 0], [1, 0], [1, 1]), counts)).toBe(false);
    expect(isValidOrder(o([0, 1], [0, 0], [1, 0], [1, 1]), counts)).toBe(false);
    expect(isValidOrder(o([0, 0], [0, 1], [1, 0], [2, 0]), counts)).toBe(false);
    expect(isValidOrder(o([0, 0], [0, 1], [1, 0], [1, 2]), counts)).toBe(false);
    expect(isValidOrder(o([0, 0], [0, 1], [1, 0], [1.5, 1]), counts)).toBe(false);
  });
});

describe("canMove and move", () => {
  const order = interleave([2, 2]); // A1 B1 A2 B2
  it("stops at both ends", () => {
    expect(canMove(order, 0, -1)).toBe(false);
    expect(canMove(order, 3, 1)).toBe(false);
    expect(canMove(order, 9, 1)).toBe(false);
  });
  it("swaps past a different dish", () => {
    expect(canMove(order, 1, 1)).toBe(true);
    expect(show(move(order, 1, 1))).toBe("A1 A2 B1 B2");
    expect(show(move(order, 1, -1))).toBe("B1 A1 A2 B2");
  });
  it("never swaps a dish's own steps", () => {
    const same = o([0, 0], [0, 1], [1, 0], [1, 1]);
    expect(canMove(same, 0, 1)).toBe(false);
    expect(move(same, 0, 1)).toBe(same);
  });
});

describe("nextOfDish and bringNext", () => {
  const order = interleave([3, 3]); // A1 B1 A2 B2 A3 B3
  it("finds the dish's next entry after a position", () => {
    expect(nextOfDish(order, 0, 1)).toBe(1);
    expect(nextOfDish(order, 1, 0)).toBe(2);
    expect(nextOfDish(order, 4, 0)).toBe(-1);
  });
  it("pulls the next step to just after the current one", () => {
    expect(show(bringNext(order, 0, 0))).toBe("A1 A2 B1 B2 A3 B3");
    expect(show(bringNext(order, 1, 0))).toBe(show(order)); // A2 is already next
    expect(show(bringNext(o([0, 0], [1, 0], [1, 1], [0, 1]), 0, 0))).toBe("A1 A2 B1 B2");
  });
  it("does nothing when the dish has no step left", () => {
    expect(bringNext(order, 4, 0)).toBe(order);
    expect(bringNext(order, 0, 0)).not.toBe(order);
  });
  it("never breaks a dish's own order, over seeded random moves", () => {
    const counts = [4, 3, 5, 2];
    let seed = 12345;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    let cur: readonly DishStep[] = interleave(counts);
    for (let i = 0; i < 500; i++) {
      const at = rand(cur.length);
      cur = rand(3) === 0 ? bringNext(cur, at, rand(counts.length)) : move(cur, at, rand(2) ? 1 : -1);
      expect(isValidOrder(cur, counts)).toBe(true);
    }
  });
});

describe("firstOpen", () => {
  const order = interleave([2, 2]); // A1 B1 A2 B2
  it("opens on the first step not done", () => {
    expect(firstOpen(order, [new Set([0]), new Set()])).toBe(1);
    expect(firstOpen(order, [new Set([0]), new Set([0])])).toBe(2);
    expect(firstOpen(order, [new Set([1]), new Set()])).toBe(0);
  });
  it("opens on 0 when nothing is done and the last when all are", () => {
    expect(firstOpen(order, [new Set(), new Set()])).toBe(0);
    expect(firstOpen(order, [new Set([0, 1]), new Set([0, 1])])).toBe(3);
    expect(firstOpen([], [])).toBe(0);
  });
});

describe("parseRecipeIds", () => {
  it("splits a comma list and trims", () => expect(parseRecipeIds("a, b,c")).toEqual(["a", "b", "c"]));
  it("takes repeated params", () => expect(parseRecipeIds(["a", "b,c"])).toEqual(["a", "b", "c"]));
  it("drops junk and duplicates", () => {
    expect(parseRecipeIds("a,,a,b c,../x,b,<s>")).toEqual(["a", "b"]);
    expect(parseRecipeIds("x".repeat(65))).toEqual([]);
    expect(parseRecipeIds(undefined)).toEqual([]);
  });
  it("caps at four", () => expect(parseRecipeIds("a,b,c,d,e,f")).toEqual(["a", "b", "c", "d"]));
});

describe("cookTogetherHref", () => {
  it("joins the ids", () => {
    expect(cookTogetherHref(["a", "b"])).toBe("/cook?recipes=a,b");
    expect(cookTogetherHref(["a b"])).toBe("/cook?recipes=a%20b");
  });
});

describe("dishInitials", () => {
  it("uses the first letter or digit, upper-cased", () => {
    expect(dishInitials(["salad", "  Pasta", "3-bean chili", "Éclair"])).toEqual(["S", "P", "3", "É"]);
  });
  it("numbers later dishes that share a mark", () => {
    expect(dishInitials(["Soup", "Salad", "Stew", "Pie"])).toEqual(["S", "S2", "S3", "P"]);
  });
  it("falls back to a question mark for emoji or blank titles", () => {
    expect(dishInitials(["🍝 ", "", "  "])).toEqual(["?", "?2", "?3"]);
    expect(dishInitials(["🍝 Pasta"])).toEqual(["P"]);
  });
});

describe("stored order", () => {
  const counts = [2, 3];
  const order = interleave(counts);
  it("round-trips", () => expect(parseOrder(serialiseOrder(order, 5), counts)).toEqual(order));
  it("is null once a recipe was edited since", () => {
    expect(parseOrder(serialiseOrder(order, 5), [2, 2])).toBeNull();
    expect(parseOrder(serialiseOrder(order, 5), [2, 4])).toBeNull();
  });
  it("is null for corrupt text, another version or a bad shape", () => {
    for (const raw of [null, "", "nope", "{}", '{"v":2,"at":1,"order":[]}', '{"v":1,"at":1}', '{"v":1,"at":1,"order":[5,null,"ab"]}'])
      expect(parseOrder(raw, counts)).toBeNull();
    expect(parseOrder('{"v":1,"at":1,"order":[["0","0"]]}', [1])).toBeNull();
  });
  it("goes stale after twelve hours, or when future-dated or unreadable", () => {
    const raw = serialiseOrder(order, 1000);
    expect(orderStale(raw, 1000 + TICKS_TTL_MS - 1)).toBe(false);
    expect(orderStale(raw, 1000 + TICKS_TTL_MS)).toBe(true);
    expect(orderStale(raw, 999)).toBe(true);
    expect(orderStale("nope", 1000)).toBe(true);
    expect(orderStale(null, 1000)).toBe(true);
  });
});
