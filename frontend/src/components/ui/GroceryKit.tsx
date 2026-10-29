"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { cx } from "./cx";
import { PlusMark } from "./Disclosure";
import { SpotIcon } from "./SpotIcon";
import type { SpotName } from "./spot-icons";

/* The grocery list's pieces (#80, GRO). Set like department signage in a shop: ruled, letter-spaced section heads, hairlines between
   rows, no boxes. Rows reuse the recipe page's tick (aria-pressed + the drawn `.strike`). Tokens only; no new ones. */

const tabular = "[font-variant-numeric:lining-nums_tabular-nums]";

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="var(--button-primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
    </svg>
  );
}

/**
 * The part of the page that holds the items (or the note that there are none). It can take focus from script, so that when
 * a button disappears (Clear ticked, Empty list) the person lands here rather than at the top of the page.
 */
export function ListBody({ ref, children }: { ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-8 outline-none">
      {children}
    </div>
  );
}

/**
 * The foot of the list: a hairline, then Show staples at the left, Clear ticked and Empty list (both destructive text
 * actions) at the right. The row wraps on a narrow screen. Any slot may be empty.
 */
export function ListActions({ staples, clear, empty }: { staples?: ReactNode; clear?: ReactNode; empty: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-(--rule-hair) pt-4 print:hidden">
      {staples && <div className="mr-auto">{staples}</div>}
      {clear}
      {empty}
    </div>
  );
}

/**
 * Where the list goes next (GRO-5): a quiet label, the buttons in a wrapping row (full width one per line on a phone), then
 * whatever the buttons have to say (hint, confirmation, error) beneath them. Not printed.
 */
export function SendArea({ label, actions, children }: { label: string; actions: ReactNode; children?: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-3 print:hidden">
      <p id={id} className="label text-ink-muted">
        {label}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center max-sm:[&>*]:w-full">{actions}</div>
      {children}
    </div>
  );
}

/**
 * The recipes on the list, folded away with one tap. Native `details`. `defaultOpen` is read once, when the shelf first
 * appears: a recipe added or taken off later never folds or opens it under the reader. It is a quiet head (hairline, muted)
 * so the heavy rule stays with the store sections the person shops from.
 */
export function RecipeShelf({ summary, defaultOpen = true, children }: { summary: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open] = useState(defaultOpen);
  return (
    <details open={open} className="group">
      <summary className="label flex min-h-control cursor-pointer list-none items-center justify-between border-b border-(--rule-hair) text-ink-muted [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="px-1">
          <PlusMark />
        </span>
      </summary>
      {children}
    </details>
  );
}

/** One recipe on the list: its title (a link), servings at the chosen scale, the scale stepper and Remove. */
export function RecipeRow({ title, meta, stepper, remove }: { title: ReactNode; meta?: string | null; stepper: ReactNode; remove: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-(--rule-hair) py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="col-start-1 row-start-1 min-w-0">
        <p className="text-body leading-snug text-ink [overflow-wrap:anywhere]">{title}</p>
        {meta && <p className="label-quiet text-ink-muted">{meta}</p>}
      </div>
      <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">{remove}</div>
      <div className="col-span-2 row-start-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-start-1">{stepper}</div>
    </li>
  );
}

/**
 * − 1× + : steps a recipe's scale. The value is a polite live region so a change is heard. A button that can't be used now
 * is `aria-disabled`, not `disabled`: it keeps keyboard focus (the person stays where they were) and the click does nothing.
 */
export function ScaleStepper({
  label,
  valueLabel,
  downLabel,
  upLabel,
  onDown,
  onUp,
  downDisabled,
  upDisabled,
}: {
  label: string;
  valueLabel: string;
  downLabel: string;
  upLabel: string;
  onDown: () => void;
  onUp: () => void;
  downDisabled?: boolean;
  upDisabled?: boolean;
}) {
  const step =
    "inline-flex size-control items-center justify-center text-(--button-ghost-fg) transition-[color] duration-150 ease-out hover:text-(--button-ghost-hover) aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:hover:text-(--button-ghost-fg)";
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-control border border-(--input-border) print:hidden">
      <button type="button" aria-label={downLabel} title={downLabel} onClick={downDisabled ? undefined : onDown} aria-disabled={downDisabled || undefined} className={step}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      </button>
      <output aria-live="polite" className={`min-w-12 text-center text-small font-semibold text-ink ${tabular}`}>
        {valueLabel}
      </output>
      <button type="button" aria-label={upLabel} title={upLabel} onClick={upDisabled ? undefined : onUp} aria-disabled={upDisabled || undefined} className={step}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 12h12M12 6v12" />
        </svg>
      </button>
    </div>
  );
}

/** A store section: a ruled, letter-spaced head that stays at the top of the screen while its items scroll under it. */
export function GrocerySection({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-4 border-b border-(--rule-double) bg-paper pt-3 pb-1.5">
        <h2 id={id} className="label text-ink">
          {title}
        </h2>
        {count && <p className="label-quiet text-ink-muted">{count}</p>}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

/**
 * One item: the whole row is the tick (a button with `aria-pressed`, 56px tall), then the menu. Amounts come first in accent
 * ("1 cup + 2 tbsp"), then the name. Ticked: an accent line is drawn through it and it turns muted. `disabled` keeps the
 * text at full strength (the list must stay readable offline).
 */
export function GroceryRow({
  itemId,
  amounts,
  name,
  note,
  checked,
  onToggle,
  disabled,
  menu,
}: {
  /** Lets the page find this row's tick to put focus back on it. */
  itemId: string;
  amounts: string;
  name: string;
  /** A small tag after the name, e.g. "Staple". */
  note?: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  menu: ReactNode;
}) {
  return (
    <li className="flex scroll-mt-14 items-stretch border-b border-(--rule-hair) print:break-inside-avoid">
      <button
        type="button"
        data-item-id={itemId}
        aria-pressed={checked}
        onClick={onToggle}
        disabled={disabled}
        className="group -ms-2 flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3.5 ps-2 py-2 text-left text-body leading-snug transition-[background-color] duration-150 ease-out enabled:hover:bg-(--panel-bg) enabled:active:bg-(--panel-bg) disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-[2px] border-[1.5px] border-ink-muted group-aria-pressed:border-(--button-primary-bg) group-aria-pressed:bg-(--button-primary-bg) print:hidden"
        >
          <Check className="hidden size-3.5 group-aria-pressed:block" />
        </span>
        <span className="min-w-0 text-ink [overflow-wrap:anywhere] group-aria-pressed:text-ink-muted">
          <span className="strike">
            {amounts && (
              <>
                <span className={`font-semibold text-(--qty-fg) group-aria-pressed:text-ink-muted ${tabular}`}>{amounts}</span>{" "}
              </>
            )}
            {name}
          </span>
          {note && <span className="label-quiet ms-2.5 whitespace-nowrap text-ink-muted">{note}</span>}
        </span>
      </button>
      {menu}
    </li>
  );
}

export type MenuItem = { label: string; onSelect: () => void; /** Set for a choice among several: marks the current one. */ checked?: boolean; danger?: boolean };
export type MenuEntry = { kind: "item"; item: MenuItem } | { kind: "group"; label: string; items: MenuItem[] } | { kind: "separator" };

/**
 * A small "options" button that opens a menu (`role="menu"`): Arrow keys, Home and End move between entries, Escape closes and
 * returns focus to the button, Tab (focus goes back to the button first, so Tab carries on from there) or a tap elsewhere closes. A group with `checked` entries is a set of radios.
 */
export function RowMenu({ label, entries, disabled }: { label: string; entries: MenuEntry[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  /** Opens above the button when the screen has no room below it (the menu is about 370px tall). */
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const choices = () => [...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  // Before the first paint: flip above the button if it won't fit below, or, with room nowhere, scroll the menu into view.
  useLayoutEffect(() => {
    const menu = wrap.current?.querySelector<HTMLElement>('[role="menu"]');
    if (!open || !wrap.current || !menu) return;
    const box = wrap.current.getBoundingClientRect();
    const need = menu.offsetHeight + 8;
    const fitsBelow = window.innerHeight - box.bottom >= need;
    setUp(!fitsBelow && box.top >= need);
    if (!fitsBelow && box.top < need) menu.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const all = choices();
    (all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const all = choices();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      all[(i + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at <= 0 ? all.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close(true);
  }

  const choice = (item: MenuItem, radio: boolean) => (
    <button
      key={item.label}
      type="button"
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? Boolean(item.checked) : undefined}
      tabIndex={-1}
      onClick={() => {
        close(true);
        item.onSelect();
      }}
      className={`group flex min-h-control w-full cursor-pointer items-center gap-3 px-4 text-left text-small hover:bg-(--panel-bg) focus-visible:bg-(--panel-bg) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) aria-checked:font-semibold ${item.danger ? "text-(--button-danger-text-fg) hover:text-(--button-danger-text-hover)" : "text-ink hover:text-(--button-ghost-hover)"}`}
    >
      {radio && (
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <svg viewBox="0 0 12 12" className="hidden size-3.5 group-aria-checked:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        </span>
      )}
      {item.label}
    </button>
  );

  return (
    <div ref={wrap} className="relative flex print:hidden" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex size-14 shrink-0 cursor-pointer items-center justify-center text-(--button-ghost-fg) transition-[color] duration-150 ease-out hover:text-(--button-ghost-hover) disabled:cursor-not-allowed disabled:opacity-55"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`absolute right-0 z-20 flex min-w-56 max-w-[calc(100vw-2rem)] flex-col border border-(--input-border) bg-paper py-1 ${up ? "bottom-full" : "top-full"}`}>
          {entries.map((entry, i) => {
            if (entry.kind === "separator") return <div key={i} role="separator" className="my-1 border-t border-(--rule-hair)" />;
            if (entry.kind === "item") return choice(entry.item, false);
            return (
              <div key={entry.label} role="group" aria-label={entry.label} className="flex flex-col">
                <p aria-hidden="true" className="label px-4 pt-2 pb-1 text-ink-muted">
                  {entry.label}
                </p>
                {entry.items.map((item) => choice(item, true))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The count after "Groceries" in the masthead: an accent numeral, spoken as "(n to buy)". */
export function NavCount({ n }: { n: number }) {
  return (
    <>
      <span aria-hidden="true" className={`ms-1.5 font-semibold text-(--qty-fg) ${tabular}`}>
        {n}
      </span>
      <span className="sr-only"> ({n} to buy)</span>
    </>
  );
}

/** A recipe in the home grid while choosing: the same plate and title as a card, but tapping ticks it instead of opening it. */
export function SelectCard({
  title,
  kicker,
  time,
  imageSrc,
  fallbackIcon,
  selected,
  onToggle,
  disabled,
  describedBy,
}: {
  title: string;
  kicker?: string;
  time?: string | null;
  imageSrc?: string | null;
  fallbackIcon: SpotName;
  selected: boolean;
  onToggle: () => void;
  /** Cannot be chosen now (a limit is reached). `aria-disabled`, not `disabled`: it keeps focus, a tap does nothing, and `describedBy` can say why. */
  disabled?: boolean;
  /** The id of the text that explains the limit. */
  describedBy?: string;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? describedBy : undefined}
        onClick={disabled ? undefined : onToggle}
        className="group flex w-full cursor-pointer flex-col gap-3 text-left aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--focus-ring)"
      >
        <span className="relative block aspect-[4/3] overflow-hidden border border-(--rule-hair) bg-(--panel-bg) group-aria-pressed:border-(--button-primary-bg) group-aria-pressed:outline-2 group-aria-pressed:-outline-offset-2 group-aria-pressed:outline-(--button-primary-bg)">
          {imageSrc ? (
            <img src={imageSrc} alt="" width={640} height={480} loading="lazy" className="size-full object-cover [filter:var(--photo-filter)]" />
          ) : (
            <span className="flex size-full items-center justify-center">
              <SpotIcon name={fallbackIcon} size={56} />
            </span>
          )}
          <span
            aria-hidden="true"
            className="absolute top-3 left-3 grid size-7 place-items-center border-[1.5px] border-ink bg-paper group-aria-pressed:border-(--button-primary-bg) group-aria-pressed:bg-(--button-primary-bg)"
          >
            <Check className="hidden size-4 group-aria-pressed:block" />
          </span>
        </span>
        <span className="flex items-baseline justify-between gap-4">
          <span className="label min-w-0 text-(--entry-kicker-fg)">{kicker}</span>
          {time && <span className="label shrink-0 text-ink-muted">{time}</span>}
        </span>
        <span className="font-display text-[1.875rem] leading-[1.1] text-ink [overflow-wrap:anywhere]">{title}</span>
      </button>
    </li>
  );
}

/** The bar pinned to the bottom while choosing recipes: a count (from 640px), the add action and a way out. Same inverse pill as the recipe page's floating bar. */
export function SelectionBar({
  status,
  action,
  onAction,
  actionDisabled,
  secondary,
  hint,
  cancel,
  onCancel,
}: {
  status: string;
  action: string;
  onAction: () => void;
  actionDisabled?: boolean;
  /** A second way forward, set as an outlined button before the main action ("Cook together"). */
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
  /** Why an action is off ("Choose one more dish"), on its own row at every width and read out when it changes (a live region, but not `role="status"`, which the page's toasts already use). The disabled secondary action is described by it. */
  hint?: string;
  cancel: string;
  onCancel: () => void;
}) {
  const hintId = useId();
  const wraps = Boolean(secondary || hint);
  return (
    <div className="selection-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+1rem)] print:hidden">
      <div
        className={cx(
          "pointer-events-auto flex max-w-full items-center gap-2 border border-(--rule-hair) bg-(--bar-bg) py-2 pr-2 pl-5 text-(--bar-fg) [--focus-ring:var(--bar-focus)] sm:gap-3 sm:pl-6",
          wraps ? "flex-wrap justify-center rounded-(--bar-radius)" : "rounded-full",
          // Two rows (a phone with a second action) is a rounded rectangle; from 640px a single row is a stadium again, unless a hint line keeps it two.
          secondary && !hint && "sm:flex-nowrap sm:rounded-full",
          !secondary && !hint && "sm:rounded-full",
        )}
      >
        <p className="label hidden whitespace-nowrap sm:block">{status}</p>
        <p id={hintId} aria-live="polite" className={hint ? "label-quiet order-first w-full pb-1 text-center" : "sr-only"}>
          {hint}
        </p>
        {secondary && (
          <button
            type="button"
            onClick={secondary.disabled ? undefined : secondary.onClick}
            aria-disabled={secondary.disabled || undefined}
            aria-describedby={secondary.disabled && hint ? hintId : undefined}
            className="label inline-flex min-h-control shrink-0 cursor-pointer items-center rounded-full border border-(--bar-fg) px-5 whitespace-nowrap text-(--bar-fg) transition-colors duration-150 hover:bg-(--bar-fg)/10 aria-disabled:cursor-not-allowed aria-disabled:border-(--bar-fg)/40 aria-disabled:opacity-60 aria-disabled:hover:bg-transparent"
          >
            {secondary.label}
          </button>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="label inline-flex min-h-control shrink-0 cursor-pointer items-center rounded-full bg-(--bar-action-bg) px-5 whitespace-nowrap text-(--bar-action-fg) disabled:cursor-not-allowed disabled:bg-transparent disabled:text-(--bar-fg) disabled:opacity-60 disabled:ring-1 disabled:ring-(--bar-fg)/40 disabled:ring-inset"
        >
          {action}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="label inline-flex min-h-control shrink-0 cursor-pointer items-center px-3 whitespace-nowrap text-(--bar-fg) underline decoration-1 underline-offset-[0.3em]"
        >
          {cancel}
        </button>
      </div>
    </div>
  );
}
