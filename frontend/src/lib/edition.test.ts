import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEdition,
  EDITION_KEY,
  DAY_STARTS_AT,
  EDITION_SCRIPT,
  EVENING_STARTS_AT,
  getEditionPreference,
  msUntilNextSwitch,
  parsePreference,
  PIN_ATTRIBUTE,
  PIN_EVENING_SCRIPT,
  pinEdition,
  unpinEdition,
  resolveEdition,
  setEditionPreference,
  type EditionPreference,
} from "./edition";

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 23, h, m, s);

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute(PIN_ATTRIBUTE);
  document.head.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resolveEdition", () => {
  it.each([
    [at(6, 59), "evening"],
    [at(7, 0), "day"],
    [at(18, 59), "day"],
    [at(19, 0), "evening"],
    [at(0, 0), "evening"],
    [at(12, 0), "day"],
  ] as const)("by the clock at %s is %s", (now, expected) => {
    expect(resolveEdition("clock", now, false)).toBe(expected);
    expect(resolveEdition("clock", now, true)).toBe(expected); // the device does not matter
  });

  it("day and evening ignore the clock and the device", () => {
    expect(resolveEdition("day", at(23), true)).toBe("day");
    expect(resolveEdition("evening", at(12), false)).toBe("evening");
  });

  it("device follows the device and ignores the clock", () => {
    expect(resolveEdition("device", at(12), true)).toBe("evening");
    expect(resolveEdition("device", at(23), false)).toBe("day");
  });
});

describe("parsePreference", () => {
  it("falls back to the clock for anything unknown", () => {
    expect(parsePreference(null)).toBe("clock");
    expect(parsePreference("dark")).toBe("clock");
    expect(parsePreference("evening")).toBe("evening");
  });
});

describe("msUntilNextSwitch", () => {
  const hour = 3_600_000;
  it.each([
    [at(6, 59), 60_000],
    [at(7, 0), 12 * hour],
    [at(18, 59), 60_000],
    [at(19, 0), 12 * hour],
    [at(0, 0), 7 * hour],
    [at(23, 30), 7.5 * hour],
    [at(12, 0, 30), 7 * hour - 30_000],
  ])("from %s waits %i ms", (now, ms) => {
    expect(msUntilNextSwitch(now)).toBe(ms);
  });
});

describe("the head script", () => {
  it("spells out the storage key and switch hours that the constants define", () => {
    expect(EDITION_SCRIPT).toContain(`localStorage.getItem("${EDITION_KEY}")`);
    expect(EDITION_SCRIPT).toContain(`h>=${EVENING_STARTS_AT}||h<${DAY_STARTS_AT}`);
    expect(EDITION_KEY).toBe("rb-edition");
  });

  const run = (pref: string | null, now: Date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    if (pref !== null) localStorage.setItem(EDITION_KEY, pref);
    document.documentElement.removeAttribute("data-theme");
    new Function(EDITION_SCRIPT)();
    return document.documentElement.dataset.theme;
  };

  it("agrees with resolveEdition for every hour and every preference", () => {
    for (let h = 0; h < 24; h++) {
      for (const pref of ["clock", "day", "evening", null, "garbage"]) {
        const expected = resolveEdition(parsePreference(pref), at(h), false);
        expect(run(pref, at(h)), `${pref} at ${h}:00`).toBe(expected);
        localStorage.clear();
      }
    }
  });

  it("leaves data-theme off for 'device' so the media query decides", () => {
    expect(run("device", at(12))).toBeUndefined();
    document.documentElement.dataset.theme = "evening";
    new Function(EDITION_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run(null, at(20))).toBe("evening");
  });
});

describe("preference storage", () => {
  it("reads clock when unset, invalid or blocked", () => {
    expect(getEditionPreference()).toBe("clock");
    localStorage.setItem(EDITION_KEY, "nope");
    expect(getEditionPreference()).toBe("clock");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getEditionPreference()).toBe("clock");
  });

  it("writes, announces the change, and tolerates blocked storage", () => {
    const seen = vi.fn();
    window.addEventListener("rb-edition-change", seen);
    setEditionPreference("evening");
    expect(localStorage.getItem(EDITION_KEY)).toBe("evening");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setEditionPreference("day")).not.toThrow();
    expect(seen).toHaveBeenCalledTimes(2);
    window.removeEventListener("rb-edition-change", seen);
    vi.restoreAllMocks();
    setEditionPreference("clock"); // storage works again: drops the in-memory choice
  });

  it("keeps a manual choice for this page session when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setEditionPreference("day");
    expect(getEditionPreference()).toBe("day");
    vi.restoreAllMocks();
    setEditionPreference("clock");
    expect(getEditionPreference()).toBe("clock");
  });
});

describe("applyEdition", () => {
  const metas = () => {
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf8f1"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16130f">';
    return [...document.querySelectorAll("meta")].map((m) => m);
  };
  const colours = (list: HTMLMetaElement[]) => list.map((m) => m.content);

  it.each([
    ["clock", at(20), false, "evening", ["#16130f", "#16130f"]],
    ["day", at(23), true, "day", ["#fbf8f1", "#fbf8f1"]],
    ["evening", at(12), false, "evening", ["#16130f", "#16130f"]],
  ] as [EditionPreference, Date, boolean, string, string[]][])("%s sets data-theme and theme-color", (pref, now, dark, theme, colour) => {
    localStorage.setItem(EDITION_KEY, pref);
    const list = metas();
    applyEdition(document, now, dark);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(colours(list)).toEqual(colour);
  });

  it("device removes data-theme and restores each meta's own colour", () => {
    localStorage.setItem(EDITION_KEY, "device");
    document.documentElement.dataset.theme = "day";
    const list = metas();
    list.forEach((m) => m.setAttribute("content", "#000000"));
    expect(applyEdition(document, at(12), true)).toBe("evening");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(colours(list)).toEqual(["#fbf8f1", "#16130f"]);
  });
});

describe("pinning an edition", () => {
  const metaColour = () => document.querySelector<HTMLMetaElement>("meta")?.content;

  it("holds against every re-apply, theme-color included, and unpin recomputes the person's edition", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fbf8f1">';
    pinEdition(document, "evening");
    expect(document.documentElement.dataset.theme).toBe("evening");
    expect(metaColour()).toBe("#16130f");
    localStorage.setItem(EDITION_KEY, "day");
    expect(applyEdition(document, at(10), false)).toBe("evening");
    expect(document.documentElement.dataset.theme).toBe("evening");
    expect(unpinEdition(document, at(10), false)).toBe("day");
    expect(document.documentElement.dataset.theme).toBe("day");
    expect(metaColour()).toBe("#fbf8f1");
    expect(document.documentElement.hasAttribute(PIN_ATTRIBUTE)).toBe(false);
  });

  it("unpin follows the clock as it is now, not as it was when pinned", () => {
    pinEdition(document, "evening");
    expect(unpinEdition(document, at(20), false)).toBe("evening");
    pinEdition(document, "evening");
    expect(unpinEdition(document, at(7), false)).toBe("day");
  });

  it("the inline script pins evening before React runs", () => {
    new Function(PIN_EVENING_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("evening");
    expect(applyEdition(document, at(12), false)).toBe("evening");
  });
});
