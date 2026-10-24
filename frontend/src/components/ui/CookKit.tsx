"use client";

import Link from "next/link";
import { Children, useLayoutEffect, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
      className="fixed inset-x-0 top-0 z-50 flex h-dvh touch-pan-y flex-col bg-paper px-6 pt-[max(1rem,env(safe-area-inset-top))] text-ink outline-none lg:px-12 print:hidden"
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

/** One segment per step: done steps in ink, the current one in claret, the rest as a hairline. Decorative. */
export function CookProgress({ count, current }: { count: number; current: number }) {
  return (
    <div aria-hidden="true" className="mt-3 flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cx("h-1.5 flex-1 transition-colors duration-150", i < current ? "bg-ink" : i === current ? "bg-accent" : "bg-rule")} />
      ))}
    </div>
  );
}

/** Portrait: chips, step (scrolls), timers, between the top bar and the footer. Landscape: three columns that scroll on their own. */
export function CookColumns({ rail, step, timers }: { rail: ReactNode; step: ReactNode; timers: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 py-4 lg:grid-cols-[26fr_44fr_26fr] lg:grid-rows-1 lg:gap-12 lg:py-8">
      <div className="min-h-0 overflow-y-auto max-lg:max-h-[35dvh] lg:order-1">{rail}</div>
      <div className="flex min-h-0 flex-col overflow-y-auto lg:order-2">{step}</div>
      <div className="min-h-0 lg:order-3 lg:overflow-y-auto">{timers}</div>
    </div>
  );
}

/**
 * "For this step": ingredients as rows (landscape) or chips (portrait). Lit ones are bright; in portrait only the lit
 * ones show until "+N more" is tapped.
 */
export function CookRail({ children, hiddenCount, anyLit }: { children: ReactNode; hiddenCount: number; anyLit: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <section aria-labelledby="cook-rail">
      <h2 id="cook-rail" className="label mb-3 text-ink-muted">
        For this step
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

export function CookRailRow({ quantity, name, lit }: { quantity: string; name: string; lit: boolean }) {
  return (
    <li
      data-lit={lit}
      className={cx(
        "flex shrink-0 items-baseline gap-3 rounded-full border border-rule px-4 py-1.5 text-small transition-colors duration-150 lg:rounded-none lg:border-0 lg:border-b lg:px-0 lg:py-3 lg:text-deck",
        lit ? "text-ink" : "text-ink-muted max-lg:group-data-[all=false]/rail:hidden",
      )}
    >
      {quantity && <span className="font-semibold text-accent [font-variant-numeric:lining-nums_tabular-nums] lg:min-w-16">{quantity}</span>}
      <span>{name}</span>
      {lit && <span className="sr-only"> (used in this step)</span>}
    </li>
  );
}

/** The step itself: kicker, then the text at 40px on an iPad (28px on a phone). */
export function CookStepText({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="my-auto select-none">
      <p className="label mb-4 text-accent">{label}</p>
      <p className="font-display text-[1.75rem] leading-[1.25] text-balance text-ink min-[700px]:text-[2.5rem] [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

/** An ingredient named in the step: claret with a solid underline. */
export function CookMention({ children }: { children: ReactNode }) {
  return <span className="text-accent underline decoration-1 underline-offset-[0.2em]">{children}</span>;
}

/** A duration in the step: tap to start a timer. 44px tall. `after` is the punctuation that follows it, kept on its line. */
export function CookTimerButton({ children, after = "", ...rest }: Omit<ComponentProps<"button">, "type"> & { after?: string }) {
  return (
    <span className="whitespace-nowrap">
      <button
        type="button"
        className="inline-flex min-h-control items-center gap-2 rounded-full border border-rule-strong bg-(--timer-bg) px-4 align-middle text-[0.7em] leading-none text-(--timer-fg) hover:border-accent"
        {...rest}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[0.9em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
        </svg>
        {children}
      </button>
      {after}
    </span>
  );
}

export function CookTimers({ children, empty }: { children: ReactNode; empty: string }) {
  return (
    <section aria-labelledby="cook-timers" className={cx("flex-col gap-3 lg:gap-4", empty && Children.count(children) === 0 ? "hidden lg:flex" : "flex")}>
      <h2 id="cook-timers" className="label text-ink-muted max-lg:sr-only">
        Timers
      </h2>
      {Children.count(children) > 0 ? (
        <div className="flex gap-4 overflow-x-auto max-lg:items-start lg:flex-col lg:overflow-visible">{children}</div>
      ) : (
        <p className="text-small text-ink-muted italic">{empty}</p>
      )}
    </section>
  );
}

const R = 90;
const C = 2 * Math.PI * R;

/**
 * A timer. `large` is a ring with big tabular digits; otherwise a compact row. A finished timer flashes claret: colour
 * only (`flash` flips about once a second), so reduced motion keeps it. `digits` is "8:38".
 */
export function CookTimer({
  label,
  digits,
  fraction,
  done,
  flash,
  large,
  small = false,
  onDismiss,
}: {
  label: string;
  digits: string;
  fraction: number;
  done: boolean;
  flash: boolean;
  large: boolean;
  /** A ring beside the first one: smaller. */
  small?: boolean;
  onDismiss: () => void;
}) {
  const alert = done && flash;
  const dismiss = (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={`${done ? "Dismiss" : "Cancel"} timer: ${label}`}
      className="label inline-flex min-h-control min-w-control items-center justify-center px-2 text-ink-muted hover:text-ink"
    >
      {done ? "Dismiss" : "Cancel"}
    </button>
  );
  const tone = alert ? "bg-accent text-on-accent" : "bg-transparent text-ink";
  if (!large) {
    return (
      <div role="group" aria-label={label} className={cx("flex items-center justify-between gap-3 border-t border-rule px-2 py-1 transition-colors duration-150", tone)}>
        <span className="label min-w-0 truncate">{label}</span>
        <span className="text-deck [font-variant-numeric:lining-nums_tabular-nums]">{done ? "Done" : digits}</span>
        {dismiss}
      </div>
    );
  }
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col items-center gap-1">
      <div className={cx("relative grid place-items-center rounded-full transition-colors duration-150", small ? "size-24 lg:size-36" : "size-28 lg:size-56", tone)}>
        <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" fill="none" strokeWidth="9">
          <circle cx="100" cy="100" r={R} className="stroke-rule-strong" />
          <circle
            cx="100"
            cy="100"
            r={R}
            className={alert ? "stroke-on-accent" : "stroke-accent"}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fraction)}
          />
        </svg>
        <div className="text-center">
          <p className={cx("font-display leading-none", small ? "text-[1.5rem] lg:text-[2.25rem]" : "text-[1.75rem] lg:text-[3.25rem]", "[font-variant-numeric:lining-nums_tabular-nums]")}>{done ? "Done" : digits}</p>
          <p className={cx("label mt-1 truncate max-lg:hidden", small ? "max-w-20 lg:max-w-28" : "max-w-28 lg:max-w-44")}>{label}</p>
        </div>
      </div>
      {dismiss}
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
export function CookFooter({ next, children }: { next?: string; children: ReactNode }) {
  return (
    <footer className="-mx-6 flex shrink-0 items-center justify-between gap-4 border-t border-rule bg-paper px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:-mx-12 lg:px-12 lg:py-4">
      <p className="hidden min-w-0 flex-1 text-small sm:block text-ink-muted lg:text-deck [overflow-wrap:anywhere]">{next === undefined ? (
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
