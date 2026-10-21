// Pure model behind the ingredient and step editors. A row is one line of text; `heading` (not null) means the
// row starts a section with that title, and the section runs until the next row with a heading.
// Section boundaries stay where they are when rows are moved: moving swaps the texts, not the headings.

export type Row = { key: string; text: string; heading: string | null };
export type Item = { text: string; section: string | null };

let counter = 0;
export const newRow = (text = "", heading: string | null = null): Row => ({ key: `r${++counter}`, text, heading });

/** Items from the API to editor rows. A heading is emitted whenever the section changes ("" ends a section). */
export function fromItems(items: Item[]): Row[] {
  let prev: string | null = null;
  return items.map((item) => {
    const section = item.section?.trim() || null;
    const heading = section !== prev ? (section ?? "") : null;
    prev = section;
    return newRow(item.text, heading);
  });
}

/** Editor rows to API items. Blank rows are dropped; a blank row's heading carries on to the next item. */
export function toItems(rows: Row[]): Item[] {
  let section: string | null = null;
  const items: Item[] = [];
  for (const row of rows) {
    if (row.heading !== null) section = row.heading.trim() || null;
    const text = row.text.trim();
    if (text) items.push({ text, section });
  }
  return items;
}

const BULLET = /^\s*(?:[-*•·▪◦–—]\s*|\d+[.)]\s+|\(\d+\)\s+)/;

/** A pasted block as one string per line, without bullets, numbering or blank lines. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean);
}

/**
 * Pastes `lines` at row `index`: an empty row is filled, otherwise the lines go in as new rows after it.
 * Returns the new rows and the key of the last row touched (to focus).
 */
export function pasteLines(rows: Row[], index: number, lines: string[], replace: boolean): { rows: Row[]; focus: string } {
  const next = [...rows];
  const target = rows[index];
  const [first, ...rest] = lines;
  const added = rest.map((text) => newRow(text));
  if (replace) {
    next[index] = { ...target, text: first };
    next.splice(index + 1, 0, ...added);
  } else {
    next.splice(index + 1, 0, newRow(first), ...added);
  }
  return { rows: next, focus: (added.at(-1) ?? next[replace ? index : index + 1]).key };
}

export function insertAfter(rows: Row[], index: number): { rows: Row[]; focus: string } {
  const row = newRow();
  return { rows: [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)], focus: row.key };
}

/** Removes a row; its section heading passes to the next row unless that has its own. */
export function removeRow(rows: Row[], index: number): Row[] {
  const next = rows.filter((_, i) => i !== index);
  const { heading } = rows[index];
  if (heading !== null && next[index] && next[index].heading === null) next[index] = { ...next[index], heading };
  return next;
}

/** Swaps the texts (and keys, so focus follows) of two neighbouring rows; headings stay put. */
export function moveRow(rows: Row[], index: number, by: -1 | 1): Row[] {
  const j = index + by;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  next[index] = { ...rows[j], heading: rows[index].heading };
  next[j] = { ...rows[index], heading: rows[j].heading };
  return next;
}

export const setText = (rows: Row[], index: number, text: string): Row[] =>
  rows.map((r, i) => (i === index ? { ...r, text } : r));

export const setHeading = (rows: Row[], index: number, heading: string | null): Row[] =>
  rows.map((r, i) => (i === index ? { ...r, heading } : r));

/** Adds the comma-separated tags in `raw` to `tags`: trimmed, lower-cased, no duplicates. */
export function addTags(tags: string[], raw: string): string[] {
  const out = [...tags];
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}
