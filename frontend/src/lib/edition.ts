// Day and evening editions. The choice is per device (localStorage `rb-edition`); by default the clock decides.
// The same rules run in the inline <head> script (EDITION_SCRIPT, written out literally below) so the first
// paint is already right; edition.test.ts runs that script against resolveEdition and checks its literals match the constants. See docs/THEMING.md.

export type Edition = "day" | "evening";
export type EditionPreference = "clock" | "day" | "evening" | "device";

export const EDITION_KEY = "rb-edition";
export const EDITION_EVENT = "rb-edition-change";
export const EVENING_STARTS_AT = 19; // local hour: evening runs 19:00 to 06:59
export const DAY_STARTS_AT = 7;
/** The paper colour of each edition, for <meta name="theme-color">. A guard test ties these to the tokens. */
export const PAPER: Record<Edition, string> = { day: "#fbf8f1", evening: "#16130f" };

const PREFERENCES: readonly EditionPreference[] = ["clock", "day", "evening", "device"];

export function parsePreference(value: unknown): EditionPreference {
  return PREFERENCES.find((p) => p === value) ?? "clock";
}

const clockEdition = (now: Date): Edition => (now.getHours() >= EVENING_STARTS_AT || now.getHours() < DAY_STARTS_AT ? "evening" : "day");

export function resolveEdition(pref: EditionPreference, now: Date, deviceDark: boolean): Edition {
  if (pref === "day" || pref === "evening") return pref;
  if (pref === "device") return deviceDark ? "evening" : "day";
  return clockEdition(now);
}

/** Milliseconds from `now` to the next 07:00 or 19:00 local time. Always greater than zero. */
export function msUntilNextSwitch(now: Date): number {
  const next = new Date(now);
  for (const hour of [DAY_STARTS_AT, EVENING_STARTS_AT]) {
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() > now.getTime()) return next.getTime() - now.getTime();
  }
  next.setDate(next.getDate() + 1);
  next.setHours(DAY_STARTS_AT, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/** Runs in <head> before first paint. `device` leaves data-theme off so the prefers-color-scheme rule decides. */
export const EDITION_SCRIPT = `(function(){try{var p;try{p=localStorage.getItem("rb-edition")}catch(e){}var h=new Date().getHours();var t=p==="day"||p==="evening"?p:p==="device"?"":h>=19||h<7?"evening":"day";if(t)document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme}catch(e){}})()`;

// Kept when storage is blocked, so a manual choice still holds for this page session.
let memory: EditionPreference | null = null;

export function getEditionPreference(): EditionPreference {
  try {
    const stored = localStorage.getItem(EDITION_KEY);
    if (stored !== null) return parsePreference(stored);
  } catch {
    // fall through to the in-memory choice
  }
  return memory ?? "clock";
}

export function setEditionPreference(pref: EditionPreference): void {
  try {
    localStorage.setItem(EDITION_KEY, pref);
    memory = null;
  } catch {
    memory = pref; // Storage can be blocked (private window); the choice then lasts until reload.
  }
  window.dispatchEvent(new Event(EDITION_EVENT));
}

/** Calls `onChange` when the preference changes here (setEditionPreference) or in another tab. */
export function subscribeEdition(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === EDITION_KEY) onChange();
  };
  window.addEventListener(EDITION_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EDITION_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sets data-theme (or removes it for `device`) and the theme-color metas. Returns the edition now showing. */
export function applyEdition(doc: Document, now: Date, deviceDark: boolean): Edition {
  const pref = getEditionPreference();
  const edition = resolveEdition(pref, now, deviceDark);
  if (pref === "device") delete doc.documentElement.dataset.theme;
  else doc.documentElement.dataset.theme = edition;
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute("media") ?? "";
    // Metas written by Next carry a prefers-color-scheme media; a forced edition overrides both.
    const own: Edition = media.includes("dark") ? "evening" : "day";
    meta.setAttribute("content", PAPER[pref === "device" ? own : edition]);
  }
  return edition;
}
