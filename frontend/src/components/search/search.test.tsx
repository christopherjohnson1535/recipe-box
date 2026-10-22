import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoMatches } from "./ResultSummary";
import { SEARCH_DEBOUNCE_MS, SearchControls } from "./SearchControls";
import { homeHref, parseSort, resultSummary } from "./url";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  push.mockClear();
  replace.mockClear();
});

const type = (value: string) => fireEvent.change(screen.getByRole("searchbox"), { target: { value } });

describe("url helpers", () => {
  it("builds home links without empty parts", () => {
    expect(homeHref({})).toBe("/");
    expect(homeHref({ q: "  lasagne ", tag: "dinner", sort: "time" })).toBe("/?q=lasagne&tag=dinner&sort=time");
    expect(homeHref({ q: "a&b" })).toBe("/?q=a%26b");
  });
  it("accepts only known sorts", () => {
    expect(parseSort("title")).toBe("title");
    expect(parseSort("relevance")).toBeUndefined();
    expect(parseSort(undefined)).toBeUndefined();
  });
  it("words the count", () => {
    expect(resultSummary(3, "lasagne", "")).toBe("3 recipes match “lasagne”");
    expect(resultSummary(1, "lasagne", "")).toBe("1 recipe matches “lasagne”");
    expect(resultSummary(2, "", "dinner")).toBe("2 recipes tagged dinner");
    expect(resultSummary(2, "soup", "dinner")).toBe("2 recipes match “soup” tagged dinner");
  });
});

describe("SearchControls", () => {
  it("keeps a plain GET form for no-JS use", () => {
    render(<SearchControls q="" tag="dinner" />);
    const form = screen.getByRole("search");
    expect(form.getAttribute("method")).toBe("get");
    expect(form.querySelector<HTMLInputElement>('input[name="tag"]')?.value).toBe("dinner");
    expect(screen.getByRole("combobox", { name: "Sort recipes" }).getAttribute("name")).toBe("sort");
  });

  it("debounces typing into one router.replace and keeps tag and sort", () => {
    render(<SearchControls q="" tag="dinner" sort="title" />);
    type("la");
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    type("lasag");
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(60));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/?q=lasag&tag=dinner&sort=title", {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("clearing the box drops ?q=", () => {
    render(<SearchControls q="soup" tag="" />);
    type("");
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("submitting pushes at once and cancels the pending debounce", () => {
    render(<SearchControls q="" tag="" />);
    type("pie");
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/?q=pie");
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not overwrite what is being typed when the URL catches up", () => {
    const { rerender } = render(<SearchControls q="" tag="" />);
    type("lasag");
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    type("lasagn"); // typed while the server was answering
    rerender(<SearchControls q="lasag" tag="" />);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("lasagn");
  });

  it("follows the URL when it changes by itself (back button)", () => {
    const { rerender } = render(<SearchControls q="soup" tag="" />);
    rerender(<SearchControls q="" tag="" />);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });

  it("offers Best match only while searching and pushes the chosen sort", () => {
    const { rerender } = render(<SearchControls q="" tag="" />);
    const names = () => screen.getAllByRole("option").map((o) => o.textContent);
    expect(names()).toEqual(["Newest", "A–Z", "Quickest"]);
    rerender(<SearchControls q="soup" tag="" />);
    expect(names()).toEqual(["Best match", "Newest", "A–Z", "Quickest"]);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "time" },
    });
    expect(push).toHaveBeenCalledWith("/?q=soup&sort=time");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(push).toHaveBeenLastCalledWith("/?q=soup");
  });
});

describe("empty state", () => {
  it("offers Clear search when nothing matches", () => {
    render(<NoMatches q="zzz" tag="dinner" />);
    expect(screen.getByRole("heading", { name: "No recipes match" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Nothing matches “zzz” tagged dinner.");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/");
  });
});
