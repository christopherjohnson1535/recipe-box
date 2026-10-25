import type { GroceryAmount, GroceryItem, GroceryList, GrocerySection } from "./types";

/** Store order (GRO-2). */
export const SECTIONS: { id: GrocerySection; label: string }[] = [
  { id: "produce", label: "Produce" },
  { id: "meat", label: "Meat" },
  { id: "fridge", label: "Fridge" },
  { id: "freezer", label: "Freezer" },
  { id: "pantry", label: "Pantry" },
  { id: "other", label: "Other" },
];

export const sectionLabel = (id: GrocerySection) => SECTIONS.find((s) => s.id === id)?.label ?? "Other";
const rank = (id: GrocerySection) => SECTIONS.findIndex((s) => s.id === id);

/** Units spelled out as words; the API sends them singular ("5 clove"), the list reads "5 cloves". */
const WORD_UNITS: Record<string, string> = {
  cup: "cups", clove: "cloves", can: "cans", jar: "jars", bag: "bags", stick: "sticks", slice: "slices", bunch: "bunches",
  sprig: "sprigs", head: "heads", stalk: "stalks", piece: "pieces", package: "packages", handful: "handfuls", pinch: "pinches", dash: "dashes",
};

/** One or less than one ("1", "½", "¾", "1/2") stays singular; "1½", "2–3" and "12" are plural. */
const isSingular = (quantity: string) => quantity === "1" || /^(?:\d\/\d|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/u.test(quantity);

function amountText({ quantity, unit }: GroceryAmount): string {
  const word = unit && quantity && !isSingular(quantity) ? (WORD_UNITS[unit] ?? unit) : unit;
  return [quantity, word].filter(Boolean).join(" ");
}

/** "1 cup + 2 tbsp"; empty when the item has no amount. */
export function amountsText(amounts: GroceryAmount[]): string {
  return amounts.map(amountText).filter(Boolean).join(" + ");
}

/** The whole line as it is read out: "1 cup + 2 tbsp milk". */
export const itemText = (item: GroceryItem) => [amountsText(item.amounts), item.name].filter(Boolean).join(" ");

const byStoreOrder = (a: GroceryItem, b: GroceryItem) => rank(a.section) - rank(b.section) || a.name.localeCompare(b.name);

/** The list with this item added or replaced, in the order the API returns. */
export function withItem(list: GroceryList, item: GroceryItem): GroceryList {
  const rest = list.items.filter((i) => i.id !== item.id);
  return { ...list, items: [...rest, item].sort(byStoreOrder) };
}

export const withoutItem = (list: GroceryList, id: string): GroceryList => ({ ...list, items: list.items.filter((i) => i.id !== id) });

export type Group = { section: GrocerySection; label: string; items: GroceryItem[]; left: number };

/**
 * The sections to show, in store order, empty ones left out. Ticked items sit at the bottom of their section, except
 * those in `holding` (just ticked: they stay put while the line is drawn through them). Staples only with `showStaples`.
 */
export function groupItems(items: GroceryItem[], showStaples: boolean, holding: ReadonlySet<string> = new Set()): Group[] {
  return SECTIONS.flatMap(({ id, label }) => {
    const inSection = items.filter((i) => i.section === id && (showStaples || !i.staple));
    if (inSection.length === 0) return [];
    const sinks = (i: GroceryItem) => i.checked && !holding.has(i.id);
    const ordered = [...inSection.filter((i) => !sinks(i)), ...inSection.filter(sinks)]; // each half keeps the API's order
    return [{ section: id, label, items: ordered, left: inSection.filter((i) => !i.checked).length }];
  });
}

/** What the masthead badge counts: items still to buy, staples excluded. */
export const toBuy = (list: GroceryList) => list.items.filter((i) => !i.checked && !i.staple).length;
