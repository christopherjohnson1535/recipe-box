import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowMenu, ScaleStepper, SelectCard, SelectionBar } from "./GroceryKit";

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
  });
});
