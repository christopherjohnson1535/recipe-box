import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStash, loadStash, saveStash } from "./draft-stash";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("draft stash", () => {
  it("round-trips a value per recipe id and clears it", () => {
    saveStash("new", { title: "a" });
    saveStash("r1", { title: "b" });
    expect(loadStash("new")).toEqual({ title: "a" });
    expect(loadStash("r1")).toEqual({ title: "b" });
    clearStash("new");
    expect(loadStash("new")).toBeNull();
    expect(loadStash("r1")).toEqual({ title: "b" });
  });

  it("returns null for corrupt data", () => {
    sessionStorage.setItem("rb-draft:new", "{nope");
    expect(loadStash("new")).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveStash("new", {})).not.toThrow();
    expect(loadStash("new")).toBeNull();
    expect(() => clearStash("new")).not.toThrow();
  });
});
