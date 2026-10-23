import { describe, expect, it } from "vitest";
import { iconForTag } from "./spot-icons";

describe("iconForTag", () => {
  it.each([
    ["Soups", "soups"],
    ["soup", "soups"],
    ["Veggie", "vegetarian"],
    ["vegan", "vegetarian"],
    ["Vegetarian", "vegetarian"],
    ["bread", "baking"],
    ["Desserts", "baking"],
    ["cakes", "baking"],
    ["30-minute", "quick"],
    ["Weeknight", "quick"],
    ["fast", "quick"],
    ["Mains", "mains"],
    ["dinner", "mains"],
    ["Cocktails", "drinks"],
    ["drink", "drinks"],
    ["Fruit", "fruit"],
    ["Berries", "fruit"],
    ["freezer", "freezer"],
    ["Make-ahead", "freezer"],
    ["freeze well", "freezer"],
    ["pasta", "default"],
    ["", "default"],
  ])("%s -> %s", (tag, icon) => {
    expect(iconForTag(tag)).toBe(icon);
  });
});
