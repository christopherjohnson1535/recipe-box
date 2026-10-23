import { describe, expect, it } from "vitest";
import { annotateStep, ingredientNames } from "./mentions";

const LINES = [
  "4 lb bone-in short ribs",
  "2 tsp kosher salt",
  "2 tbsp olive oil",
  "1 large onion, diced",
  "2 carrots, diced",
  "2 tbsp tomato paste",
  "2 cups dry red wine",
  "salt to taste",
  "1 clove garlic, grated",
  "1 lb tomatoes (about 3)",
];
const linked = (text: string, lines = LINES) =>
  annotateStep(text, lines).flatMap((p) => (p.kind === "ingredient" ? [[p.text, p.ingredient]] : []));

describe("ingredientNames", () => {
  it("drops the quantity, size words, preparation and what follows a comma", () => {
    expect(ingredientNames("1 large onion, diced")).toEqual(["onion"]);
    expect(ingredientNames("4 lb bone-in short ribs")).toEqual(["short ribs", "ribs"]);
    expect(ingredientNames("2 cups dry red wine")).toEqual(["red wine", "wine"]);
    expect(ingredientNames("½ cup parsley, finely chopped")).toEqual(["parsley"]);
    expect(ingredientNames("1 lb tomatoes (about 3)")).toEqual(["tomatoes"]);
    expect(ingredientNames("salt to taste")).toEqual(["salt"]);
    expect(ingredientNames("1 clove garlic, grated")).toEqual(["garlic"]);
  });

  it("has nothing for a line with no usable name", () => {
    expect(ingredientNames("")).toEqual([]);
    expect(ingredientNames("1 cup")).toEqual([]);
  });
});

describe("annotateStep", () => {
  it("links the full name or its last word, case-insensitively", () => {
    expect(linked("Season the Ribs with salt.")).toEqual([["Ribs", 0], ["salt", 1]]);
    expect(linked("Brown the short ribs in olive oil.")).toEqual([["short ribs", 0], ["olive oil", 2]]);
    expect(linked("Splash in the wine.")).toEqual([["wine", 6]]);
  });

  it("matches singular and plural", () => {
    expect(linked("Add the onions and the carrot.")).toEqual([["onions", 3], ["carrot", 4]]);
    expect(linked("Chop the tomato.")).toEqual([["tomato", 9]]);
    expect(linked("Add 2 tomatoes.", ["tomato"])).toEqual([["tomatoes", 0]]);
    expect(linked("The berries burst.", ["1 cup berry"])).toEqual([["berries", 0]]);
  });

  it("matches whole words only", () => {
    expect(linked("Season with saltiness and carroty notes.")).toEqual([]);
  });

  it("longest match wins, and each ingredient links once per step", () => {
    expect(linked("Stir in the tomato paste, then more tomato paste.", LINES.slice(0, 9))).toEqual([["tomato paste", 5]]);
    expect(linked("Season the ribs and the ribs again.")).toEqual([["ribs", 0]]);
  });

  it("links several ingredients in one step, in order", () => {
    const parts = annotateStep("Add the onion and carrots.", LINES);
    expect(parts.map((p) => p.text).join("")).toBe("Add the onion and carrots.");
    expect(parts.map((p) => p.kind)).toEqual(["text", "ingredient", "text", "ingredient", "text"]);
  });

  it("sets durations as timers and never links inside them", () => {
    const parts = annotateStep("Cook the onion 12 minutes, then add the wine.", LINES);
    expect(parts.map((p) => p.kind)).toEqual(["text", "ingredient", "text", "timer", "text", "ingredient", "text"]);
    expect(parts[3]).toEqual({ kind: "timer", text: "12 minutes", label: "12 min" });
    expect(linked("Simmer 10 minutes.", ["10 minutes of patience"])).toEqual([]);
  });

  it("returns plain text when nothing matches", () => {
    expect(annotateStep("Rest.", LINES)).toEqual([{ kind: "text", text: "Rest." }]);
    expect(annotateStep("", LINES)).toEqual([]);
  });
});
