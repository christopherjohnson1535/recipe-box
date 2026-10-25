import { groupItems, itemText } from "./list-model";
import type { GroceryList } from "./types";

export const SHARE_TITLE = "Groceries";

/**
 * The list as plain text for the share sheet or the clipboard (GRO-5): a title, then each store section in order with
 * its unticked items as "- 1 cup + 2 tbsp milk", exactly as the page words them. Staples only when the page shows them.
 */
export function groceryShareText(list: GroceryList, showStaples: boolean): string {
  const sections = groupItems(list.items, showStaples)
    .map((g) => ({ label: g.label, lines: g.items.filter((i) => !i.checked).map((i) => `- ${itemText(i)}`) }))
    .filter((s) => s.lines.length > 0);
  if (sections.length === 0) return `${SHARE_TITLE}\n\nNothing to buy.`;
  return [SHARE_TITLE, ...sections.map((s) => `${s.label}\n${s.lines.join("\n")}`)].join("\n\n");
}
