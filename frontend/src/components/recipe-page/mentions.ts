import { splitDurations } from "@/lib/recipe";
import { splitIngredient } from "@/lib/scale";

/** A piece of step text: plain, a timer ("12 minutes"), or the name of ingredient number `ingredient`. */
export type StepPart =
  | { kind: "text"; text: string }
  | { kind: "timer"; text: string; label: string }
  | { kind: "ingredient"; text: string; ingredient: number };

// Words dropped from the front of an ingredient to get its name: sizes, states, preparation.
const NOISE = new Set(
  "a an large small medium big fresh freshly finely coarsely roughly thinly thickly chopped diced minced sliced grated ground whole boneless skinless bone-in ripe cold hot warm melted softened unsalted salted dry dried of extra-large of the".split(
    " ",
  ),
);

/**
 * The names a step might use for an ingredient line: the short name ("bone-in short ribs" → "short ribs") and its last
 * word ("ribs"). The name is the text before a comma or bracket, minus "to taste"-style tails and leading noise words.
 * shortcut: two ingredients ending in the same word ("olive oil", "sesame oil") both answer to "oil" (the earlier row
 * wins), and a word like "oil" can match a step's plain use of it; fine for a link a person can ignore.
 */
export function ingredientNames(line: string): string[] {
  const words = splitIngredient(line)
    .rest.toLowerCase()
    .split(/[,(;]/)[0]
    .replace(/\s+(to taste|for .*|as needed|or .*)$/, "")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && NOISE.has(words[0])) words.shift();
  const full = words.join(" ");
  const last = words.at(-1) ?? "";
  if (!full || NOISE.has(full)) return [];
  return [...new Set([full, ...(last.length >= 3 ? [last] : [])])];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The phrase with its last word as singular or plural: onion/onions, tomato/tomatoes, berry/berries.
function phrasePattern(phrase: string): string {
  const words = phrase.split(" ");
  const last = words.pop() as string;
  const stem = last.replace(/ies$/, "y").replace(/(?<=[sxzo]|ch|sh)es$/, "").replace(/(?<!s)s$/, "");
  const tail = stem.endsWith("y") ? `${escape(stem.slice(0, -1))}(?:y|ies)` : `${escape(stem)}(?:e?s)?`;
  return [...words.map(escape), tail].join("\\s+");
}

/**
 * Splits one step into text, timers and ingredient mentions. Names match case-insensitively on word boundaries; the
 * longest match wins, then the earlier ingredient; each ingredient is linked once per step; timers are never linked into.
 * `lines` are the ingredient texts, in order: ingredient i links to `#ingredient-i`.
 */
export function annotateStep(text: string, lines: string[]): StepPart[] {
  const names = lines.map(ingredientNames);
  const parts: StepPart[] = [];
  for (const seg of splitDurations(text)) {
    if (seg.minutes !== null) parts.push({ kind: "timer", text: seg.text, label: seg.label ?? seg.text });
    else parts.push(...mentionsIn(seg.text, names));
  }
  return parts;
}

function mentionsIn(text: string, names: string[][]): StepPart[] {
  const found: { start: number; end: number; ingredient: number }[] = [];
  names.forEach((phrases, ingredient) => {
    for (const phrase of phrases) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${phrasePattern(phrase)}(?![\\p{L}\\p{N}])`, "giu");
      for (const m of text.matchAll(re)) found.push({ start: m.index, end: m.index + m[0].length, ingredient });
    }
  });
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.ingredient - b.ingredient || a.start - b.start);
  const taken: typeof found = [];
  for (const f of found) {
    if (taken.some((t) => f.start < t.end && t.start < f.end || t.ingredient === f.ingredient)) continue;
    taken.push(f);
  }
  taken.sort((a, b) => a.start - b.start);
  const parts: StepPart[] = [];
  let at = 0;
  for (const t of taken) {
    if (t.start > at) parts.push({ kind: "text", text: text.slice(at, t.start) });
    parts.push({ kind: "ingredient", text: text.slice(t.start, t.end), ingredient: t.ingredient });
    at = t.end;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}
