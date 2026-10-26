import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipeShelf, RowMenu, ScaleStepper, SelectCard, SelectionBar, SendArea } from "./GroceryKit";

function menu(onSelect = vi.fn()) {
  render(
    <>
      <RowMenu
        label="Options for milk"
        entries={[
          { kind: "group", label: "Move to", items: [{ label: "Fridge", checked: true, onSelect }, { label: "Freezer", checked: false, onSelect }] },
          { kind: "separator" },
          { kind: "item", item: { label: "Remove", danger: true, onSelect } },
        ]}
      />
      <button type="button">after</button>
    </>,
  );
  return { trigger: screen.getByRole("button", { name: "Options for milk" }), onSelect };
}

describe("RowMenu", () => {
  it("is closed until opened, then focuses the current choice", () => {
    const { trigger } = menu();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Fridge" }));
    expect(screen.getByRole("group", { name: "Move to" })).toBeTruthy();
  });

  it("moves with the arrow keys, Home and End, wrapping around", () => {
    const { trigger } = menu();
    fireEvent.click(trigger);
    const menuEl = screen.getByRole("menu");
    fireEvent.keyDown(menuEl, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Freezer" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Fridge" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Fridge" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Remove" }));
  });

  it("opens with the down arrow from the button", () => {
    const { trigger } = menu();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes on Escape and gives focus back to the button", () => {
    const { trigger } = menu();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab and on a tap elsewhere", () => {
    const { trigger } = menu();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger); // so the Tab carries on from the button, not from the top of the page
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "after" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs the choice, closes and returns focus", () => {
    const { trigger, onSelect } = menu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("RowMenu near the edge of the screen", () => {
  afterEach(() => vi.restoreAllMocks());

  /** jsdom has no layout: say where the button is on a 768px-high screen and how tall the menu is. */
  function place(top: number, bottom: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(372);
  }

  it("opens below the button when there is room", () => {
    place(100, 156);
    const { trigger } = menu();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu").className).toContain("top-full");
  });

  it("opens above the button when there is room only there, and goes back below on the next open", () => {
    place(700, 756);
    const { trigger } = menu();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu").className).toContain("bottom-full");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    place(100, 156);
    fireEvent.click(trigger);
    expect(screen.getByRole("menu").className).toContain("top-full");
  });

  it("scrolls the menu into view when neither side has room", () => {
    place(300, 756);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { trigger } = menu();
    fireEvent.click(trigger);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
    expect(screen.getByRole("menu").className).toContain("top-full");
  });
});

describe("RecipeShelf", () => {
  it("starts open, or folded when asked, and keeps what the reader chose when the page re-renders", () => {
    const { rerender } = render(
      <RecipeShelf summary="On this list" defaultOpen={false}>
        <p>rows</p>
      </RecipeShelf>,
    );
    const shelf = () => screen.getByText("On this list").closest("details")!;
    expect(shelf().open).toBe(false);
    shelf().open = true;
    rerender(
      <RecipeShelf summary="On this list" defaultOpen>
        <p>rows</p>
      </RecipeShelf>,
    );
    expect(shelf().open).toBe(true);
    shelf().open = false;
    rerender(
      <RecipeShelf summary="On this list" defaultOpen>
        <p>rows</p>
      </RecipeShelf>,
    );
    expect(shelf().open).toBe(false); // defaultOpen is read once
  });
});

describe("ScaleStepper", () => {
  it("names both buttons and shows the value", () => {
    render(<ScaleStepper label="Servings of Chili" valueLabel="2×" downLabel="Fewer" upLabel="More" onDown={vi.fn()} onUp={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Servings of Chili" }).textContent).toBe("2×");
  });

  it("marks an end aria-disabled, ignores its click and keeps keyboard focus on it", () => {
    const onUp = vi.fn();
    const onDown = vi.fn();
    render(<ScaleStepper label="Servings of Chili" valueLabel="2×" downLabel="Fewer" upLabel="More" onDown={onDown} onUp={onUp} upDisabled />);
    const more = screen.getByRole("button", { name: "More" }) as HTMLButtonElement;
    more.focus();
    fireEvent.click(more);
    expect(onUp).not.toHaveBeenCalled();
    expect(more.getAttribute("aria-disabled")).toBe("true");
    expect(more.disabled).toBe(false); // a disabled button would drop focus
    expect(document.activeElement).toBe(more);
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    expect(onDown).toHaveBeenCalledOnce();
  });
});

describe("SelectCard and SelectionBar", () => {
  it("is a toggle named by the recipe", () => {
    const onToggle = vi.fn();
    render(<SelectCard title="Chili" kicker="soups" time="30 min" fallbackIcon="soups" selected onToggle={onToggle} />);
    const card = screen.getByRole("button", { name: /Chili/ });
    expect(card.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card);
    expect(onToggle).toHaveBeenCalled();
  });

  it("offers the action and a way out", () => {
    const onAction = vi.fn();
    const onCancel = vi.fn();
    render(<SelectionBar status="2 chosen" action="Add 2 to groceries" onAction={onAction} cancel="Cancel" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to groceries" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAction).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    // Without a second action, the bar holds exactly the main action and the way out.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Add 2 to groceries", "Cancel"]);
  });

  it("sets a secondary action before the main one", () => {
    const onSecondary = vi.fn();
    const onAction = vi.fn();
    render(<SelectionBar status="2 chosen" action="Add 2 to groceries" onAction={onAction} secondary={{ label: "Cook together", onClick: onSecondary }} cancel="Cancel" onCancel={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cook together", "Add 2 to groceries", "Cancel"]);
    fireEvent.click(screen.getByRole("button", { name: "Cook together" }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("can disable the secondary action without touching the main one", () => {
    const onSecondary = vi.fn();
    render(<SelectionBar status="1 chosen" action="Add 1 to groceries" onAction={() => {}} secondary={{ label: "Cook together", onClick: onSecondary, disabled: true }} cancel="Cancel" onCancel={() => {}} />);
    const secondary = screen.getByRole("button", { name: "Cook together" }) as HTMLButtonElement;
    expect(secondary.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add 1 to groceries" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(secondary);
    expect(onSecondary).not.toHaveBeenCalled();
  });
});

describe("SendArea", () => {
  it("labels the group, and sets its message under the buttons", () => {
    render(
      <SendArea label="Send to…" actions={<button type="button">Copy list</button>}>
        <p>Copied.</p>
      </SendArea>,
    );
    const group = screen.getByRole("group", { name: "Send to…" });
    expect(group.textContent).toBe("Send to…Copy list" + "Copied.");
  });
});
