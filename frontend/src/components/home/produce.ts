import type { Season } from "./issue";

// shortcut: a fixed Northern-hemisphere list, add a hemisphere/region setting if the household is ever south of the equator.
export const IN_SEASON: Record<Season, string[]> = {
  Spring: ["Asparagus", "Rhubarb", "Ramps", "Peas", "Radishes", "Morels", "Artichokes", "Spring onions", "Fava beans", "Strawberries"],
  Summer: ["Tomatoes", "Sweet corn", "Peaches", "Zucchini", "Basil", "Blueberries", "Cucumbers", "Green beans", "Apricots", "Eggplant"],
  Autumn: ["Delicata squash", "Pears", "Chanterelles", "Cranberries", "Brussels sprouts", "Concord grapes", "Celeriac", "Apples", "Quince", "Fennel"],
  Winter: ["Blood oranges", "Kale", "Leeks", "Parsnips", "Citrus", "Beets", "Cabbage", "Turnips", "Pomegranates", "Potatoes"],
};
