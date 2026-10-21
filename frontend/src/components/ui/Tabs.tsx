"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "./cx";

export type TabItem<T extends string = string> = { id: T; label: string };

type TabsProps<T extends string> = {
  label: string;
  /** The panel is `${idPrefix}-panel` and is named by the selected tab `${idPrefix}-tab-${id}`. */
  idPrefix: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
};

/** Tablist set like the tag index: the selected tab gets an accent underline. Arrow keys, Home and End move and select. */
export function Tabs<T extends string>({ label, idPrefix, tabs, value, onChange }: TabsProps<T>) {
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
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-x-6 border-b border-(--rule-hair)">
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
            onClick={() => onChange(t.id)}
            className={cx(
              "label -mb-px inline-flex min-h-control items-center border-b-2 px-1 whitespace-nowrap",
              "transition-[border-color,color] duration-150 ease-out",
              selected
                ? "border-(--chip-underline-selected) text-(--chip-fg-selected)"
                : "border-transparent text-(--chip-fg) hover:border-(--chip-underline-hover) hover:text-(--chip-fg-hover)",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
