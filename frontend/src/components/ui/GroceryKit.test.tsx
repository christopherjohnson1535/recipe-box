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
  it("names both buttons, shows the value and disables the ends", () => {
    const onUp = vi.fn();
    render(<ScaleStepper label="Servings of Chili" valueLabel="2×" downLabel="Fewer" upLabel="More" onDown={vi.fn()} onUp={onUp} upDisabled />);
    expect(screen.getByRole("group", { name: "Servings of Chili" }).textContent).toBe("2×");
    expect((screen.getByRole("button", { name: "More" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Fewer" }) as HTMLButtonElement).disabled).toBe(false);
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
