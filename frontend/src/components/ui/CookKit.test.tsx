import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CookDishColumn,
  CookDishColumns,
  CookDishLegend,
  CookDishMark,
  CookDishTabs,
  CookMoveButtons,
  CookNudge,
  CookReorderList,
  CookStepItem,
  CookStepText,
  CookViewChoice,
} from "./CookKit";

afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
  delete (HTMLElement.prototype as { offsetTop?: unknown }).offsetTop;
});

describe("CookDishMark", () => {
  it("names the dish for screen readers; the chip is decoration", () => {
    render(<CookDishMark dish={0} initial="S" name="Salad" size="sm" />);
    const name = screen.getByText("Salad");
    expect(name.className).toContain("sr-only");
    expect(screen.getByText("S").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the name beside the chip at md", () => {
    render(<CookDishMark dish={1} initial="R" name="Roast" />);
    expect(screen.getByText("Roast").className).not.toContain("sr-only");
  });

  it("tells the four dishes apart by fill and shape as well as colour", () => {
    const signatures = [0, 1, 2, 3].map((dish) => {
      const { container, unmount } = render(<CookDishMark dish={dish} initial="S" name={`Dish ${dish}`} />);
      const mark = container.firstElementChild as HTMLElement;
      const out = `${mark.dataset.dishFill}/${mark.dataset.dishShape}`;
      unmount();
      return out;
    });
    expect(signatures).toEqual(["solid/round", "outline/round", "solid/square", "outline/square"]);
  });

  it("keeps a dish number outside 0 to 3 on a mark rather than failing", () => {
    const { container } = render(<CookDishMark dish={4} initial="S" name="Fifth" />);
    expect((container.firstElementChild as HTMLElement).dataset.dishFill).toBe("solid");
  });
});

describe("CookDishLegend", () => {
  it("is a list with one item per dish", () => {
    render(
      <CookDishLegend>
        <CookDishMark dish={0} initial="S" name="Salad" />
        <CookDishMark dish={1} initial="R" name="Roast" />
      </CookDishLegend>,
    );
    const list = screen.getByRole("list", { name: "Dishes" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["SSalad", "RRoast"]);
  });
});

describe("CookStepText and CookStepItem", () => {
  it("step text without a dish is just the label and the text", () => {
    const { container } = render(<CookStepText label="Step 2 of 5">Chop the onion.</CookStepText>);
    const kicker = screen.getByText("Step 2 of 5");
    expect(kicker.parentElement?.className).toContain("justify-between"); // the label sits straight in the kicker row
    expect(container.textContent).toBe("Step 2 of 5Chop the onion.");
  });

  it("step text puts the dish mark before the label", () => {
    render(
      <CookStepText label="Step 2 of 5" dish={<CookDishMark dish={0} initial="S" name="Salad" />}>
        Chop the onion.
      </CookStepText>,
    );
    const label = screen.getByText("Step 2 of 5");
    expect(label.parentElement?.firstElementChild?.textContent).toBe("SSalad");
  });

  it("an item without the new props renders as it always did", () => {
    render(
      <ol>
        <CookStepItem number={3} current done={false} tick={<button type="button">Done</button>}>
          Whisk.
        </CookStepItem>
      </ol>,
    );
    const item = screen.getByRole("listitem");
    expect(item.getAttribute("aria-current")).toBe("step");
    expect(item.children).toHaveLength(2); // numeral, then the text column
    expect(item.children[0].textContent).toBe("3");
    const column = item.children[1];
    expect(column.lastElementChild?.tagName).toBe("BUTTON"); // the tick is a direct child, nothing wraps it
    expect(item.textContent).toBe("3Step 3: Whisk.Done");
  });

  it("an item with a dish and controls shows both", () => {
    render(
      <ol>
        <CookStepItem
          number={1}
          current={false}
          done
          tick={<button type="button">Done</button>}
          dish={<CookDishMark dish={2} initial="P" name="Pasta" size="sm" />}
          controls={<button type="button">Move</button>}
        >
          Boil.
        </CookStepItem>
      </ol>,
    );
    const item = screen.getByRole("listitem");
    expect(item.children[0].textContent).toBe("PPasta1");
    expect(within(item).getByRole("button", { name: "Move" })).toBeTruthy();
    expect(item.textContent).toContain("Step 1: Boil.");
    const buttons = within(item).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Done", "Move"]); // controls come after the tick
  });
});

describe("CookMoveButtons", () => {
  function setup(canEarlier: boolean, canLater: boolean) {
    const onEarlier = vi.fn();
    const onLater = vi.fn();
    render(<CookMoveButtons stepLabel="Salad step 2" canEarlier={canEarlier} canLater={canLater} onEarlier={onEarlier} onLater={onLater} />);
    return { onEarlier, onLater, earlier: screen.getByRole("button", { name: "Move Salad step 2 earlier" }), later: screen.getByRole("button", { name: "Move Salad step 2 later" }) };
  }

  it("has a named button each way, which call back when they can move", () => {
    const { earlier, later, onEarlier, onLater } = setup(true, true);
    fireEvent.click(earlier);
    fireEvent.click(later);
    expect(onEarlier).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(earlier.getAttribute("aria-disabled")).toBeNull();
  });

  it("marks an unavailable move aria-disabled, does nothing on a tap, and stays focusable", () => {
    const { earlier, later, onEarlier, onLater } = setup(false, true);
    expect(earlier.getAttribute("aria-disabled")).toBe("true");
    expect(later.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(earlier);
    expect(onEarlier).not.toHaveBeenCalled();
    earlier.focus();
    expect(document.activeElement).toBe(earlier);
    fireEvent.click(later);
    expect(onLater).toHaveBeenCalled();
  });
});

describe("CookViewChoice", () => {
  const options = [
    { id: "one", label: "One step" },
    { id: "all", label: "All steps" },
    { id: "dish", label: "By dish" },
  ] as const;

  it("is a radiogroup with the chosen option checked and the only tab stop", () => {
    render(<CookViewChoice label="View" options={options} value="all" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves and chooses with the arrow keys, Home and End, wrapping around", () => {
    const onChange = vi.fn();
    render(<CookViewChoice label="View" options={options} value="one" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("all");
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("dish");
    fireEvent.keyDown(radios[0], { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("dish");
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("all");
    fireEvent.keyDown(radios[0], { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("one");
    onChange.mockClear();
    fireEvent.keyDown(radios[0], { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("chooses on a tap", () => {
    const onChange = vi.fn();
    render(<CookViewChoice label="View" options={options} value="one" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "By dish" }));
    expect(onChange).toHaveBeenCalledWith("dish");
  });
});

describe("CookDishTabs", () => {
  const tabs = [
    { id: "a", label: "Salad", mark: <CookDishMark dish={0} initial="S" name="Salad" size="sm" /> },
    { id: "b", label: "Roast", mark: <CookDishMark dish={1} initial="R" name="Roast" size="sm" /> },
    { id: "c", label: "Pie", mark: <CookDishMark dish={2} initial="P" name="Pie" size="sm" /> },
  ] as const;

  it("wires tabs and panel the way ui/Tabs does", () => {
    render(
      <CookDishTabs label="Ingredients by dish" idPrefix="rail" tabs={tabs} value="b" onChange={() => {}}>
        <p>Onions</p>
      </CookDishTabs>,
    );
    const list = screen.getByRole("tablist", { name: "Ingredients by dish" });
    const found = within(list).getAllByRole("tab");
    expect(found.map((t) => t.id)).toEqual(["rail-tab-a", "rail-tab-b", "rail-tab-c"]);
    expect(found.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(found.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(found[1].getAttribute("aria-controls")).toBe("rail-panel");
    // The mark's own text would double the tab's name.
    expect(found[1].textContent).toBe("RRoastRoast");
    expect(screen.getByRole("tab", { name: "Roast" })).toBe(found[1]);
    const panel = screen.getByRole("tabpanel", { name: "Roast" });
    expect(panel.id).toBe("rail-panel");
    expect(panel.textContent).toBe("Onions");
  });

  it("moves and chooses with the arrow keys, Home and End", () => {
    const onChange = vi.fn();
    render(
      <CookDishTabs label="Ingredients by dish" idPrefix="rail" tabs={tabs} value="a" onChange={onChange}>
        <p>x</p>
      </CookDishTabs>,
    );
    const first = screen.getByRole("tab", { name: "Salad" });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Roast" }));
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(first, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(first, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    fireEvent.click(screen.getByRole("tab", { name: "Pie" }));
    expect(onChange).toHaveBeenLastCalledWith("c");
  });
});

describe("CookDishColumns", () => {
  it("gives each dish a section named by its heading, holding its steps", () => {
    render(
      <CookDishColumns>
        <CookDishColumn heading="Salad">
          <CookStepItem number={1} current={false} done={false} tick={null}>
            Wash.
          </CookStepItem>
        </CookDishColumn>
        <CookDishColumn heading="Roast">
          <CookStepItem number={1} current={false} done={false} tick={null}>
            Season.
          </CookStepItem>
        </CookDishColumn>
      </CookDishColumns>,
    );
    const salad = screen.getByRole("region", { name: "Salad" });
    expect(within(salad).getByRole("heading", { name: "Salad" })).toBeTruthy();
    expect(within(salad).getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Roast" })).getByText(/Season/)).toBeTruthy();
  });
});

describe("CookNudge", () => {
  it("is a button named by its text; the mark is decoration", () => {
    const onClick = vi.fn();
    render(
      <CookNudge onClick={onClick} mark={<CookDishMark dish={1} initial="R" name="Roast" size="sm" />}>
        Bring Roast’s next step here
      </CookNudge>,
    );
    const button = screen.getByRole("button", { name: "Bring Roast’s next step here" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("CookReorderList", () => {
  // jsdom has no layout: place each item 100px apart by its index so a reorder moves things.
  function layout() {
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        return Array.prototype.indexOf.call(this.parentElement?.children ?? [], this) * 100;
      },
    });
  }
  const motion = (reduce: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  const items = (order: string[]) => (
    <CookReorderList>
      {order.map((id, i) => (
        <CookStepItem key={id} number={i + 1} current={false} done={false} tick={<button type="button">{`Done ${id}`}</button>}>
          {id}
        </CookStepItem>
      ))}
    </CookReorderList>
  );

  it("glides the steps that changed places, from where they were, and leaves the rest", () => {
    layout();
    motion(false);
    const animate = vi.fn();
    (Element.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(items(["a", "b", "c"]));
    expect(animate).not.toHaveBeenCalled(); // arriving is not moving
    rerender(items(["b", "a", "c"]));
    expect(animate).toHaveBeenCalledTimes(2);
    const calls = animate.mock.calls.map(([frames, options]) => ({ from: (frames as { transform: string }[])[0].transform, to: (frames as { transform: string }[])[1].transform, ms: (options as { duration: number }).duration }));
    expect(calls).toEqual(expect.arrayContaining([
      { from: "translateY(-100px)", to: "none", ms: 220 }, // a moved down
      { from: "translateY(100px)", to: "none", ms: 220 }, // b moved up
    ]));
  });

  it("does not animate when the order is the same", () => {
    layout();
    motion(false);
    const animate = vi.fn();
    (Element.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(items(["a", "b"]));
    rerender(items(["a", "b"]));
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not animate under reduced motion", () => {
    layout();
    motion(true);
    const animate = vi.fn();
    (Element.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(items(["a", "b", "c"]));
    rerender(items(["c", "b", "a"]));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Step 1: cDone c", "2Step 2: bDone b", "3Step 3: aDone a"]);
  });

  it("keeps focus on a button whose step moved (React restores it after the move)", () => {
    layout();
    motion(false);
    // Browsers drop focus from a node that is moved; jsdom does not, so do it here.
    for (const method of ["insertBefore", "appendChild"] as const) {
      const original = Node.prototype[method] as (this: Node, ...args: unknown[]) => Node;
      vi.spyOn(Node.prototype, method).mockImplementation(function (this: Node, ...args: unknown[]) {
        const moved = args[0] as Node;
        const had = moved.contains(document.activeElement) && moved.parentNode !== null;
        const result = original.apply(this, args);
        if (had) (document.activeElement as HTMLElement).blur();
        return result;
      } as never);
    }
    const { rerender } = render(items(["a", "b", "c"]));
    const button = screen.getByRole("button", { name: "Done a" });
    button.focus();
    expect(document.activeElement).toBe(button);
    rerender(items(["b", "a", "c"]));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done a" }));
  });
});
