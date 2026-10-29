"use client";

import Link from "next/link";
import { Children, createContext, isValidElement, useContext, useId, useLayoutEffect, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { pinEdition, unpinEdition } from "@/lib/edition";
import { cx } from "./cx";

const DARK = "(prefers-color-scheme: dark)";

/**
 * The cook-mode stage (#41): a full-screen evening-edition dialog. Cook mode is always the evening edition, so it pins
 * that edition on <html> while mounted (EditionController respects the pin) and unpins by recomputing the person's own.
 * It is modal: the rest of the app is inert while it is open. Landscape (1024px and up) is three columns, rail / step /
 * timers; narrower, the rail becomes chips above the step and the timers sit below it. Other props (touch handlers) go
 * to the root, so a swipe works anywhere on the stage.
 */
export function CookStage({ children, ...rest }: { children: ReactNode } & Omit<ComponentProps<"div">, "className">) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    pinEdition(document, "evening");
    return () => void unpinEdition(document, new Date(), window.matchMedia?.(DARK).matches ?? false);
  }, []);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    const hidden: Element[] = [];
    for (let node: Element | null = stage; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling === node || sibling.tagName === "SCRIPT" || sibling.hasAttribute("inert")) continue;
        sibling.setAttribute("inert", "");
        hidden.push(sibling);
      }
    }
    stage.focus({ preventScroll: true });
    return () => hidden.forEach((el) => el.removeAttribute("inert"));
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Cooking mode"
      tabIndex={-1}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh touch-pan-y flex-col bg-paper pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] text-ink outline-none lg:pl-[max(3rem,env(safe-area-inset-left))] lg:pr-[max(3rem,env(safe-area-inset-right))] print:hidden"
      {...rest}
    >
      {children}
    </div>
  );
}

/** Close link, recipe title, and the slot for the voice toggle. */
export function CookTopBar({ closeHref, onClose, title, children }: { closeHref: string; onClose?: ComponentProps<typeof Link>["onClick"]; title: string; children?: ReactNode }) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <Link href={closeHref} onClick={onClose} className="label inline-flex min-h-control items-center gap-2 justify-self-start text-ink-muted hover:text-ink">
        <span aria-hidden="true">×</span> Close
      </Link>
      <h1 className="font-display max-w-[40vw] truncate text-title-sm text-ink">{title}</h1>
      <div className="justify-self-end">{children}</div>
    </header>
  );
}

/** Voice on/off. `listening` shows the status line the design calls for. */
export function CookVoiceToggle({ listening, ...rest }: { listening: boolean } & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-pressed={listening}
      className="label inline-flex min-h-control items-center gap-2 rounded-control px-2 whitespace-nowrap text-ink-muted hover:text-ink"
      {...rest}
    >
      <span aria-hidden="true" className={cx("size-3 rounded-full border", listening ? "border-accent bg-accent" : "border-ink-muted")} />
      {listening ? 'Listening for "next"' : "Voice off"}
    </button>
  );
}

/** One segment per step: ticked steps in ink, steps passed but not ticked in muted ink, the current one in the accent, the rest as a hairline. Decorative. */
export function CookProgress({ count, current, done }: { count: number; current: number; done: ReadonlySet<number> }) {
  return (
    <div aria-hidden="true" className="mt-3 flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cx("h-1.5 flex-1 transition-colors duration-150", i === current ? "bg-accent" : done.has(i) ? "bg-ink" : i < current ? "bg-ink-muted" : "bg-rule")}
        />
      ))}
    </div>
  );
}

/** The row under the progress bar: view switch on the left, wake-lock status and "Clear ticks" on the right, a note beneath. */
export function CookToolbar({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="group" aria-label="Cook mode controls" tabIndex={-1} className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 outline-none">
      {children}
    </div>
  );
}

/** "One step / All steps": two pressed-state buttons in a pill, 44px each. */
export function CookViewToggle({ all, onChange }: { all: boolean; onChange: (all: boolean) => void }) {
  const button = (on: boolean, label: string, value: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(value)}
      className={cx(
        "label inline-flex min-h-control min-w-28 items-center justify-center px-4 whitespace-nowrap transition-colors duration-150 focus-visible:outline-offset-[-4px]",
        on ? "bg-(--button-primary-bg) text-(--button-primary-fg)" : "text-ink hover:text-accent",
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="View" className="flex overflow-hidden rounded-full border border-(--button-secondary-border)">
      {button(!all, "One step", false)}
      {button(all, "All steps", true)}
    </div>
  );
}

/**
 * Screen wake-lock status. While the lock is held it is a plain note; otherwise a 44px button that opens a short
 * explanation (`note`), shown on its own line under the toolbar.
 */
export function CookWakeStatus({ on, checking, open, onToggle }: { on: boolean; checking?: boolean; open: boolean; onToggle: () => void }) {
  const dot = <span aria-hidden="true" className={cx("size-3 shrink-0 rounded-full border", on ? "border-accent bg-accent" : "border-ink-muted")} />;
  if (checking) return null; // nothing to say until the first request answers
  if (on) {
    return (
      <p className="label inline-flex min-h-control items-center gap-2 text-ink-muted">
        {dot}Screen stays on
      </p>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? "cook-wake-note" : undefined}
      onClick={onToggle}
      className="label inline-flex min-h-control items-center gap-2 rounded-control px-2 whitespace-nowrap text-ink-muted hover:text-ink"
    >
      {dot}Screen may sleep
    </button>
  );
}

/** The wake-lock explanation, a direct child of the toolbar so it spans the whole row. */
export function CookWakeNote({ children }: { children: ReactNode }) {
  return (
    <p id="cook-wake-note" className="order-last w-full text-small text-ink-muted italic">
      {children}
    </p>
  );
}

/** Quiet text button, 44px tall ("Clear ticks"). */
export function CookTextButton(props: Omit<ComponentProps<"button">, "type" | "className">) {
  return (
    <button
      type="button"
      className="label inline-flex min-h-control items-center rounded-control px-2 text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink"
      {...props}
    />
  );
}

/** A tick box with a label, pressed when done. 44px tall. */
export function CookTick({ pressed, children, ...rest }: { pressed: boolean } & Omit<ComponentProps<"button">, "type" | "className" | "aria-pressed">) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="group label inline-flex min-h-control shrink-0 items-center gap-3 rounded-control px-2 text-ink hover:text-accent"
      {...rest}
    >
      <span
        aria-hidden="true"
        className="grid size-6 place-items-center rounded-[2px] border-[1.5px] border-ink-muted transition-colors duration-150 group-aria-pressed:border-(--button-primary-bg) group-aria-pressed:bg-(--button-primary-bg)"
      >
        <svg viewBox="0 0 12 12" className="hidden size-4 group-aria-pressed:block" fill="none" stroke="var(--button-primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      </span>
      {children}
    </button>
  );
}

/** True inside a `CookColumns` with `wide`: the timers are a strip, not a column. */
const WideContext = createContext(false);

/**
 * Portrait: chips, step (scrolls), timers, between the top bar and the footer. Landscape: three columns that scroll on their own.
 * `wide` (the by-dish view) gives the step area the width of the step and the timers together: the rail stays on the left, the
 * timers become a strip above the step area, and the step area has the room for a column per dish. Portrait is the same either way.
 */
export function CookColumns({ rail, step, timers, wide = false }: { rail: ReactNode; step: ReactNode; timers: ReactNode; wide?: boolean }) {
  return (
    <WideContext.Provider value={wide}>
      <div
        className={cx(
          "grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 py-4 lg:py-8",
          wide ? "lg:grid-cols-[22fr_78fr] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-4" : "lg:grid-cols-[26fr_44fr_26fr] lg:grid-rows-1 lg:gap-12",
        )}
      >
        <div className={cx("min-h-0 overflow-y-auto max-lg:max-h-[35dvh] lg:order-1", wide && "lg:col-start-1 lg:row-span-2 lg:row-start-1")}>{rail}</div>
        <div className={cx("flex min-h-0 flex-col overflow-y-auto lg:order-2", wide && "lg:col-start-2 lg:row-start-2")}>{step}</div>
        <div className={cx("min-h-0 lg:order-3 lg:overflow-y-auto", wide && "lg:col-start-2 lg:row-start-1 lg:overflow-visible")}>{timers}</div>
      </div>
    </WideContext.Provider>
  );
}

/**
 * "For this step": ingredients as rows (landscape) or chips (portrait). Lit ones are bright; in portrait only the lit
 * ones show until "+N more" is tapped.
 */
export function CookRail({ children, hiddenCount, anyLit, heading = "For this step" }: { children: ReactNode; hiddenCount: number; anyLit: boolean; /** "Ingredients" when nothing is lit because the tab is not the step's dish. */ heading?: string }) {
  const [all, setAll] = useState(false);
  return (
    <section aria-labelledby="cook-rail">
      <h2 id="cook-rail" className="label mb-3 text-ink-muted">
        {heading}
      </h2>
      <ul data-all={all} className="group/rail flex gap-2 max-lg:overflow-x-auto data-[all=true]:max-lg:flex-wrap lg:flex-col lg:gap-0">
        {children}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
          className="label mt-2 inline-flex min-h-control items-center text-ink-muted underline underline-offset-4 hover:text-ink lg:hidden"
        >
          {all ? "Show fewer" : anyLit ? `+${hiddenCount} more` : `All ingredients (${hiddenCount})`}
        </button>
      )}
    </section>
  );
}

/** One ingredient: a button the cook taps to tick off (accent line through it, muted, as on the recipe page). */
export function CookRailRow({ quantity, name, lit, ticked, onToggle }: { quantity: string; name: string; lit: boolean; ticked: boolean; onToggle: () => void }) {
  return (
    <li data-lit={lit} className={cx("shrink-0 text-small min-[700px]:text-deck", lit ? "text-ink" : "text-ink-muted max-lg:group-data-[all=false]/rail:hidden")}>
      <button
        type="button"
        aria-pressed={ticked}
        onClick={onToggle}
        className="group flex min-h-control w-full items-baseline gap-3 rounded-full border border-rule px-4 py-1.5 text-left transition-colors duration-150 aria-pressed:text-ink-muted lg:rounded-none lg:border-0 lg:border-b lg:px-0 lg:py-3"
      >
        {quantity && (
          <span className="font-semibold text-accent [font-variant-numeric:lining-nums_tabular-nums] group-aria-pressed:text-ink-muted lg:min-w-16">
            <span className="strike">{quantity}</span>
          </span>
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <span className="strike">{name}</span>
        </span>
        {lit && <span className="sr-only"> (used in this step)</span>}
      </button>
    </li>
  );
}

/** The step itself: kicker (with an optional action such as the Done toggle beside it), then the text at 40px on an iPad (28px on a phone). */
export function CookStepText({ label, action, dish, children }: { label: string; action?: ReactNode; /** A `CookDishMark` (with `wrap`), shown on its own row above the kicker when several dishes are cooked together. */ dish?: ReactNode; children: ReactNode }) {
  return (
    <div className="my-auto select-none">
      {dish && <div className="mb-3">{dish}</div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4">
        <p className="label text-accent">{label}</p>
        {action}
      </div>
      <p className="font-display text-[1.75rem] leading-[1.25] text-balance text-ink min-[700px]:text-[2.5rem] [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

/** The all-steps view: every step in order. */
export function CookStepList({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col">{children}</ol>;
}

/**
 * One step in the list, 24px text (28px from 700px) with its numeral and a tick on the right. The current step has an accent
 * bar on its left and scrolls into view when it becomes current; a done step is muted. Cooking several dishes together, `dish`
 * (a `CookDishMark`) sits above the numeral and `controls` (`CookMoveButtons`) after the tick.
 */
export function CookStepItem({
  number,
  current,
  done,
  tick,
  dish,
  controls,
  children,
}: {
  number: number;
  current: boolean;
  done: boolean;
  tick: ReactNode;
  dish?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView?.({ block: "center" });
  }, [current]);
  const numeral = (
    <span aria-hidden="true" className="font-display text-numeral text-accent [font-variant-numeric:lining-nums_tabular-nums]">
      {number}
    </span>
  );
  return (
    <li
      ref={ref}
      aria-current={current ? "step" : undefined}
      className={cx(
        "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule border-l-4 py-5 pl-3 transition-colors duration-150 min-[700px]:grid-cols-[3.5rem_minmax(0,1fr)]",
        current ? "border-l-accent" : "border-l-transparent",
        done ? "text-ink-muted" : "text-ink",
      )}
    >
      {dish ? (
        <div className="flex flex-col items-start gap-2">
          {dish}
          {numeral}
        </div>
      ) : (
        numeral
      )}
      <div className="flex flex-col items-start gap-2">
        <p className="font-display text-[1.5rem] leading-[1.3] [overflow-wrap:anywhere] min-[700px]:text-[1.75rem]">
          <span className="sr-only">Step {number}: </span>
          {children}
        </p>
        {controls ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-1">
            {tick}
            {controls}
          </div>
        ) : (
          tick
        )}
      </div>
    </li>
  );
}

// ===== Cook together (#82): several dishes, one cook. =====

/* One entry per dish colour. Fill and shape differ as well as colour, so two dishes are told apart without it; the
   class strings are written out so Tailwind sees them. Tokens: --cook-dish-N, --cook-on-dish-N (components.css). */
/** True inside a column heading: the mark's name is then the heading text, not a small label. */
const HeadingContext = createContext(false);

const DISH = [
  { fill: "solid", shape: "round", tone: "border-(--cook-dish-1) bg-(--cook-dish-1) text-(--cook-on-dish-1)" },
  { fill: "outline", shape: "round", tone: "border-(--cook-dish-2) text-(--cook-on-dish-2)" },
  { fill: "solid", shape: "square", tone: "border-(--cook-dish-3) bg-(--cook-dish-3) text-(--cook-on-dish-3)" },
  { fill: "outline", shape: "square", tone: "border-(--cook-dish-4) text-(--cook-on-dish-4)" },
] as const;

/**
 * The mark of one dish: its initial in a chip whose colour, fill (solid or outline) and shape (round or square) are
 * unique to it. The dish name is the accessible text: shown beside the chip as a label at "md", visually hidden at "sm".
 * Inside a `CookDishColumn` heading the name is set as the heading itself (title size, wrapping) instead. `dish` is 0 to 3.
 */
export function CookDishMark({ dish, initial, name, size = "md", wrap = false }: { dish: number; initial: string; name: string; size?: "sm" | "md"; /** Let the name wrap onto more lines instead of truncating; for a mark with a row to itself. */ wrap?: boolean }) {
  const d = DISH[((dish % DISH.length) + DISH.length) % DISH.length];
  const heading = useContext(HeadingContext);
  return (
    <span data-dish-fill={d.fill} data-dish-shape={d.shape} className="inline-flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cx(
          "inline-grid shrink-0 place-items-center border-2 font-display leading-none uppercase",
          d.shape === "round" ? "rounded-full" : "rounded-control",
          size === "sm" ? "size-7 text-[0.9375rem]" : "size-9 text-[1.125rem]",
          d.tone,
        )}
      >
        {initial}
      </span>
      <span className={size === "sm" ? "sr-only" : heading ? "min-w-0 font-display text-title-sm text-ink [overflow-wrap:anywhere]" : cx("label min-w-0 text-ink", wrap ? "[overflow-wrap:anywhere]" : "truncate")}>{name}</span>
    </span>
  );
}

/** The dishes being cooked, one `CookDishMark` each, in a row under the top bar. */
export function CookDishLegend({ children }: { children: ReactNode }) {
  return (
    <ul role="list" aria-label="Dishes" className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-1">
      {Children.map(children, (child) => (
        <li className="min-w-0">{child}</li>
      ))}
    </ul>
  );
}

const chevron = { earlier: "M6 15l6-6 6 6", later: "M6 9l6 6 6-6" };
const moveButton =
  "inline-flex size-control shrink-0 items-center justify-center rounded-control border border-rule-strong text-ink transition-[border-color,color] duration-150 hover:border-accent hover:text-accent aria-disabled:cursor-not-allowed aria-disabled:border-dotted aria-disabled:border-rule aria-disabled:text-ink-muted aria-disabled:hover:border-rule aria-disabled:hover:text-ink-muted";

/**
 * Earlier / Later for one step: two 44px icon buttons. A step that cannot move that way keeps its button (dotted, muted,
 * `aria-disabled`, a tap does nothing) rather than disabling it, so keyboard focus is not lost when a step reaches an end.
 */
export function CookMoveButtons({ stepLabel, canEarlier, canLater, onEarlier, onLater }: { stepLabel: string; canEarlier: boolean; canLater: boolean; onEarlier: () => void; onLater: () => void }) {
  const button = (way: keyof typeof chevron, can: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-label={`Move ${stepLabel} ${way}`}
      title={`Move ${stepLabel} ${way}`}
      aria-disabled={can ? undefined : true}
      onClick={() => can && onClick()}
      className={moveButton}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={chevron[way]} />
      </svg>
    </button>
  );
  return (
    <div className="flex gap-2">
      {button("earlier", canEarlier, onEarlier)}
      {button("later", canLater, onLater)}
    </div>
  );
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
/** The glide's duration and curve are the motion tokens (`--duration-base`, `--ease-out`); jsdom has no stylesheet, so keywords stand in there. */
function glideTiming() {
  const css = getComputedStyle(document.documentElement);
  const ms = parseFloat(css.getPropertyValue("--duration-base"));
  return { duration: ms > 0 ? ms : 300, easing: css.getPropertyValue("--ease-out").trim() || "ease-out" };
}
/**
 * The all-steps list for several dishes: children are `CookStepItem`s with stable keys. When their order changes the steps
 * glide to their new places (FLIP: each item starts from where it was and slides home, transform only, on the motion
 * tokens) unless the person asks for reduced motion. A browser drops keyboard focus from a button whose step was moved, so
 * the screen that moves steps puts it back.
 */
export function CookReorderList({ children }: { children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  const placed = useRef(new Map<HTMLElement, number>());
  const snapshot = (ol: HTMLOListElement) => new Map(Array.from(ol.children, (el) => [el as HTMLElement, (el as HTMLElement).offsetTop]));
  // Positions are read only when the order changes (and when the list's own size does), not on every render and timer tick.
  const order = Children.toArray(children).map((child) => (isValidElement(child) ? child.key : "")).join("|");

  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const before = placed.current;
    placed.current = snapshot(ol);
    if (before.size === 0 || reducedMotion()) return;
    const top = ol.getBoundingClientRect().top;
    const timing = glideTiming();
    for (const [el, now] of placed.current) {
      const was = before.get(el);
      if (was === undefined) continue;
      // An item still gliding is somewhere between its old and new place: start from where it is drawn.
      const running = el.getAnimations?.() ?? [];
      const drawn = running.length ? el.getBoundingClientRect().top - top - now : 0;
      running.forEach((a) => a.cancel());
      const dy = was - now + drawn;
      if (Math.abs(dy) < 1) continue;
      el.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "none" }], timing);
    }
  }, [order]);
  // A resize or a text re-wrap moves the steps without reordering them; that must not glide next time.
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const resnap = () => void (placed.current = snapshot(ol));
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resnap);
      return () => window.removeEventListener("resize", resnap);
    }
    const watch = new ResizeObserver(resnap);
    watch.observe(ol);
    return () => watch.disconnect();
  }, []);

  return (
    <ol ref={list} className="relative flex flex-col">
      {children}
    </ol>
  );
}

/** "One step / All steps / By dish": a radio group set like `CookViewToggle`, the filled pill sliding to the chosen option. Arrow keys, Home and End move and choose. */
export function CookViewChoice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const group = useRef<HTMLDivElement>(null);
  const at = Math.max(0, options.findIndex((o) => o.id === value));

  function onKeyDown(e: KeyboardEvent) {
    const last = options.length - 1;
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = (next + options.length) % options.length;
    onChange(options[to].id);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  }

  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="relative grid max-w-full auto-cols-fr grid-flow-col overflow-hidden rounded-full border border-(--button-secondary-border)">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-(--button-primary-bg) transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${100 / options.length}%`, transform: `translateX(${at * 100}%)` }}
      />
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cx(
              "label relative inline-flex min-h-control min-w-28 items-center justify-center px-4 whitespace-nowrap transition-colors duration-150 focus-visible:outline-offset-[-4px] max-sm:min-w-0 max-sm:px-3",
              on ? "text-(--button-primary-fg)" : "text-ink hover:text-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * By dish: from 1024px (iPad landscape) two columns of dishes, so three or four wrap to a second row and every column keeps a
 * readable measure (use it in a `wide` `CookColumns`); stacked under a hairline below that. Put a `CookDishColumn` per dish inside.
 */
export function CookDishColumns({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2">{children}</div>;
}

/** One dish's steps: its heading (a `CookDishMark` and the dish's title), then `CookStepItem`s styled as in `CookStepList`. */
export function CookDishColumn({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 border-t border-rule pt-8 pb-6 first:border-t-0 first:pt-0 lg:border-t-0 lg:px-8 lg:pt-0 lg:odd:pl-0 lg:even:border-l lg:even:pr-0 lg:nth-[n+3]:border-t lg:nth-[n+3]:pt-8"
    >
      <h2 id={id} className="mb-2 flex min-w-0 items-center gap-3 font-display text-title-sm text-ink">
        <HeadingContext.Provider value>{heading}</HeadingContext.Provider>
      </h2>
      <ol className="flex flex-col">{children}</ol>
    </section>
  );
}

/**
 * Tabs for the ingredients rail, set for the stage: each tab is the dish's mark (a `CookDishMark`, hidden from screen readers
 * since the tab has its own name) and, when there is room, its name. On a phone and in the narrow landscape rail only the
 * chosen tab shows its name (the others keep it as their title and accessible name). Same keys and wiring as `ui/Tabs`: the panel is `${idPrefix}-panel`, named by the chosen `${idPrefix}-tab-${id}`.
 */
export function CookDishTabs<T extends string>({
  label,
  idPrefix,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly { id: T; label: string; mark: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent) {
    const at = tabs.findIndex((t) => t.id === value);
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = tabs[(next + tabs.length) % tabs.length];
    onChange(to.id);
    list.current?.querySelector<HTMLElement>(`#${idPrefix}-tab-${to.id}`)?.focus();
  }

  return (
    <div>
      <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-(--rule-hair)">
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              id={`${idPrefix}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              title={t.label}
              onClick={() => onChange(t.id)}
              className={cx(
                "-mb-px inline-flex min-h-control min-w-control items-center justify-center gap-2 border-b-2 px-2 transition-[border-color,color] duration-150 ease-out [--focus-offset:-3px]",
                selected
                  ? "min-w-0 border-(--chip-underline-selected) text-(--chip-fg-selected)"
                  : "shrink-0 border-transparent text-(--chip-fg) hover:border-(--chip-underline-hover) hover:text-(--chip-fg-hover)",
              )}
            >
              <span aria-hidden="true" className="inline-flex shrink-0">
                {t.mark}
              </span>
              <span className={cx("label min-w-0 truncate", !selected && "sr-only sm:max-lg:not-sr-only")}>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${value}`} className="pt-3">
        {children}
      </div>
    </div>
  );
}

/** "Bring <dish>'s next step here": a quiet text button led by the dish's mark, 44px tall. */
export function CookNudge({ children, onClick, mark }: { children: ReactNode; onClick: () => void; mark: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-control items-center gap-3 rounded-control px-2 text-left text-small text-ink-muted transition-colors duration-150 hover:text-ink"
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {mark}
      </span>
      <span className="underline decoration-1 underline-offset-4">{children}</span>
    </button>
  );
}

/** An ingredient named in the step: accent with a solid underline. */
export function CookMention({ children }: { children: ReactNode }) {
  return <span className="text-accent underline decoration-1 underline-offset-[0.2em]">{children}</span>;
}

/**
 * A duration in the step: tap to start a timer. 44px tall. `after` is the punctuation that follows it, kept on its line.
 * `left` ("8:38") marks the chip whose timer is running: accent, with the time left after the text.
 */
export function CookTimerButton({ children, after = "", left, ...rest }: Omit<ComponentProps<"button">, "type"> & { after?: string; left?: string }) {
  return (
    <span className="whitespace-nowrap">
      <button
        type="button"
        className={cx(
          "inline-flex min-h-control items-center gap-2 rounded-full border px-4 align-middle text-[0.7em] leading-none transition-colors duration-150",
          left ? "border-accent bg-accent text-on-accent" : "border-rule-strong bg-(--timer-bg) text-(--timer-fg) hover:border-accent",
        )}
        {...rest}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[0.9em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
        </svg>
        {children}
        {left && <span className="border-l border-current/40 pl-2 [font-variant-numeric:lining-nums_tabular-nums]">{left}</span>}
      </button>
      {after}
    </span>
  );
}

/** Timer sound on or off: a pressed-state text button like the voice switch, 44px tall. */
export function CookSoundToggle({ muted, onChange }: { muted: boolean; onChange: (muted: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={!muted}
      onClick={() => onChange(!muted)}
      className="label inline-flex min-h-control items-center gap-2 rounded-control px-2 whitespace-nowrap text-ink-muted hover:text-ink"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
      {muted ? "Timer sound off" : "Timer sound on"}
    </button>
  );
}

export function CookTimers({ children, empty }: { children: ReactNode; empty: string }) {
  const wide = useContext(WideContext);
  return (
    <section aria-labelledby="cook-timers" className={cx("flex-col gap-3", wide ? "lg:flex-row lg:items-center lg:gap-6" : "lg:gap-4", empty && Children.count(children) === 0 ? "hidden lg:flex" : "flex")}>
      <h2 id="cook-timers" className={cx("label text-ink-muted max-lg:sr-only", wide && "lg:shrink-0")}>
        Timers
      </h2>
      {Children.count(children) > 0 ? (
        <div className={cx("flex gap-4 overflow-x-auto max-lg:items-start", wide ? "min-w-0 lg:items-center" : "lg:flex-col lg:overflow-visible")}>{children}</div>
      ) : (
        <p className="text-small text-ink-muted italic">{empty}</p>
      )}
    </section>
  );
}

const R = 90;
const C = 2 * Math.PI * R;

/**
 * A timer. `large` is a ring with big tabular digits; otherwise a compact row. A finished timer flashes the accent colour: colour
 * only (`flash` flips about once a second), so reduced motion keeps it. `digits` is "8:38". Running and paused timers have a
 * Pause / Resume button, every timer a "+1 min" button, each 44px; a paused timer shows its frozen digits and the word
 * "Paused" (the ring is muted as well, but the word carries it).
 */
export function CookTimer({
  label,
  digits,
  fraction,
  done,
  flash,
  large,
  small = false,
  paused = false,
  onDismiss,
  onTogglePause,
  onAddMinute,
}: {
  label: string;
  digits: string;
  fraction: number;
  done: boolean;
  flash: boolean;
  large: boolean;
  /** A ring beside the first one: smaller. */
  small?: boolean;
  /** Counting stopped by the cook: the digits stay as they were. */
  paused?: boolean;
  onDismiss: () => void;
  onTogglePause: () => void;
  onAddMinute: () => void;
}) {
  const alert = done && flash;
  const wide = useContext(WideContext); // a strip above the step area: small rings, the name beside Cancel
  const button = "label inline-flex min-h-control min-w-control items-center justify-center px-2 whitespace-nowrap text-ink-muted hover:text-ink";
  const controls = (
    <div className="flex items-center">
      {!done && (
        <button type="button" onClick={onTogglePause} aria-label={`${paused ? "Resume" : "Pause"} timer: ${label}`} className={button}>
          {paused ? "Resume" : "Pause"}
        </button>
      )}
      <button type="button" onClick={onAddMinute} aria-label={`Add a minute: ${label}`} className={button}>
        +1 min
      </button>
      <button type="button" onClick={onDismiss} aria-label={`${done ? "Dismiss" : "Cancel"} timer: ${label}`} className={button}>
        {done ? "Dismiss" : "Cancel"}
      </button>
    </div>
  );
  const tone = alert ? "bg-accent text-on-accent" : "bg-transparent text-ink";
  if (!large) {
    return (
      <div role="group" aria-label={label} className={cx("flex flex-wrap items-center justify-between gap-x-3 border-t border-rule px-2 py-1 transition-colors duration-150", tone)}>
        <span className="label min-w-24 flex-1 truncate">{label}</span>
        <span className="text-deck [font-variant-numeric:lining-nums_tabular-nums]">
          {paused && <span className="label mr-2">Paused</span>}
          {done ? "Done" : digits}
        </span>
        {controls}
      </div>
    );
  }
  return (
    <div role="group" aria-label={label} className={cx("flex shrink-0 flex-col items-center gap-1", wide && "lg:flex-row lg:gap-2")}>
      <div className={cx("relative grid place-items-center rounded-full transition-colors duration-150", wide ? (small ? "size-24 lg:size-20" : "size-28 lg:size-20") : small ? "size-24 lg:size-36" : "size-28 lg:size-56", tone)}>
        <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" fill="none" strokeWidth="9">
          <circle cx="100" cy="100" r={R} className="stroke-rule-strong" />
          <circle
            cx="100"
            cy="100"
            r={R}
            className={alert ? "stroke-on-accent" : paused ? "stroke-ink-muted" : "stroke-accent"}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fraction)}
          />
        </svg>
        <div className="text-center">
          <p className={cx("font-display leading-none", wide ? (small ? "text-[1.5rem] lg:text-[1.25rem]" : "text-[1.75rem] lg:text-[1.25rem]") : small ? "text-[1.5rem] lg:text-[2.25rem]" : "text-[1.75rem] lg:text-[3.25rem]", "[font-variant-numeric:lining-nums_tabular-nums]")}>{done ? "Done" : digits}</p>
          {paused && <p className="label mt-1">Paused</p>}
          {!wide && <p className={cx("label mt-1 line-clamp-2 max-lg:hidden", small ? "max-w-20 lg:max-w-28" : "max-w-28 lg:max-w-44")}>{label}</p>}
        </div>
      </div>
      {wide ? (
        <div className="flex flex-col items-center lg:items-start">
          <p className="label hidden max-w-48 min-w-0 lg:line-clamp-2" title={label}>
            {label}
          </p>
          {controls}
        </div>
      ) : (
        <>
          {/* Upright the ring has no room for its name: it goes under the ring, so several timers can be told apart. */}
          <p aria-hidden="true" className={cx("label line-clamp-3 text-center text-ink-muted lg:hidden", small ? "max-w-24" : "max-w-28")}>
            {label}
          </p>
          {controls}
        </>
      )}
    </div>
  );
}

/** Polite live region for timer and "repeat" announcements. Always mounted so later text is read. */
export function CookLive({ children }: { children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {children}
    </div>
  );
}

/** Bottom bar: the preview of the next step on the left, Back and Next pills on the right. */
/** `next` is the text of the following step, or undefined on the last one. */
export function CookFooter({ next, summary, children }: { next?: string; /** Replaces the next-step preview (the all-steps view). */ summary?: string; children: ReactNode }) {
  return (
    <footer className="-ml-[max(1.5rem,env(safe-area-inset-left))] -mr-[max(1.5rem,env(safe-area-inset-right))] flex shrink-0 items-center justify-between gap-4 border-t border-rule bg-paper pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:-ml-[max(3rem,env(safe-area-inset-left))] lg:-mr-[max(3rem,env(safe-area-inset-right))] lg:pl-[max(3rem,env(safe-area-inset-left))] lg:pr-[max(3rem,env(safe-area-inset-right))] lg:py-4">
      <p className="hidden min-w-0 flex-1 text-small sm:block text-ink-muted lg:text-deck [overflow-wrap:anywhere]">{summary !== undefined ? (
          summary
        ) : next === undefined ? (
          "Last step"
        ) : (
          <>
            Next · <span className="text-ink">{next}</span>
          </>
        )}
      </p>
      <div className="flex flex-1 gap-3 sm:flex-none">{children}</div>
    </footer>
  );
}

const pill = "label inline-flex min-h-15 flex-1 items-center justify-center gap-2 rounded-full px-4 whitespace-nowrap text-body sm:min-w-32 sm:flex-none sm:px-8 disabled:cursor-not-allowed disabled:opacity-55";
const pillVariant = {
  primary: "bg-(--button-primary-bg) text-(--button-primary-fg) hover:bg-(--button-primary-bg-hover) hover:text-(--button-primary-fg-hover)",
  secondary: "border border-(--button-secondary-border) text-(--button-secondary-fg) hover:border-(--button-secondary-hover) hover:text-(--button-secondary-hover)",
};

/** Back / Next step pill, 60px tall. */
export function CookPill({ variant = "primary", className, ...rest }: { variant?: keyof typeof pillVariant } & Omit<ComponentProps<"button">, "type">) {
  return <button type="button" className={cx(pill, pillVariant[variant], className)} {...rest} />;
}

export function CookPillLink({ variant = "primary", className, ...rest }: { variant?: keyof typeof pillVariant } & ComponentProps<typeof Link>) {
  return <Link className={cx(pill, pillVariant[variant], className)} {...rest} />;
}
