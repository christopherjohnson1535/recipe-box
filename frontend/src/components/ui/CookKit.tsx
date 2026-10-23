"use client";

import Link from "next/link";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * The cook-mode stage (#41): a full-screen evening-edition page. Cook mode is always the evening edition, so it sets
 * <html data-theme="evening"> while mounted and puts back what was there. Landscape (1024px and up) is three
 * columns, rail / step / timers; narrower, the rail becomes chips above the step and the timers sit below it.
 */
export function CookStage({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    root.dataset.theme = "evening";
    return () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper px-6 pt-[max(1rem,env(safe-area-inset-top))] text-ink lg:px-12 print:hidden">
      {children}
    </div>
  );
}

/** Close link, recipe title, and the slot for the voice toggle. */
export function CookTopBar({ closeHref, title, children }: { closeHref: string; title: string; children?: ReactNode }) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <Link href={closeHref} className="label inline-flex min-h-control items-center gap-2 justify-self-start text-ink-muted hover:text-ink">
        <span aria-hidden="true">×</span> Close
      </Link>
      <p className="font-display max-w-[40vw] truncate text-title-sm text-ink">{title}</p>
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
      className="label inline-flex min-h-control items-center gap-2 rounded-control px-2 text-ink-muted hover:text-ink"
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

export function CookColumns({ rail, step, timers }: { rail: ReactNode; step: ReactNode; timers: ReactNode }) {
  return (
    <div className="grid flex-1 grid-cols-1 content-start gap-6 py-6 lg:grid-cols-[17rem_minmax(0,1fr)_19rem] lg:gap-12 lg:py-10">
      <div className="lg:order-1">{rail}</div>
      <div className="lg:order-2">{step}</div>
      <div className="lg:order-3">{timers}</div>
    </div>
  );
}

/** "For this step": ingredients as chips (portrait) or rows (landscape); lit ones bright, the rest dimmed. */
export function CookRail({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="cook-rail">
      <h2 id="cook-rail" className="label mb-3 text-ink-muted">
        For this step
      </h2>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">{children}</ul>
    </section>
  );
}

export function CookRailRow({ quantity, name, lit }: { quantity: string; name: string; lit: boolean }) {
  return (
    <li
      data-lit={lit}
      className={cx(
        "flex items-baseline gap-3 rounded-full border border-rule px-4 py-1.5 text-small transition-colors duration-150 lg:rounded-none lg:border-0 lg:border-b lg:px-0 lg:py-3 lg:text-deck",
        lit ? "text-ink" : "text-ink-muted",
      )}
    >
      {quantity && <span className="font-semibold text-accent [font-variant-numeric:lining-nums_tabular-nums] lg:min-w-16">{quantity}</span>}
      <span>{name}</span>
      {lit && <span className="sr-only"> (used in this step)</span>}
    </li>
  );
}

/** The step itself: kicker, then the text at 40px on an iPad (28px on a phone). */
export function CookStepText({ label, children, ...rest }: { label: string; children: ReactNode } & ComponentProps<"div">) {
  return (
    <div className="touch-pan-y select-none" {...rest}>
      <p className="label mb-4 text-accent">{label}</p>
      <p className="font-display text-[1.75rem] leading-[1.25] text-balance text-ink md:text-[2.5rem] [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

/** An ingredient named in the step: claret with a solid underline. */
export function CookMention({ children }: { children: ReactNode }) {
  return <span className="text-accent underline decoration-1 underline-offset-[0.2em]">{children}</span>;
}

/** A duration in the step: tap to start a timer. 44px tall. */
export function CookTimerButton({ children, ...rest }: Omit<ComponentProps<"button">, "type">) {
  return (
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
  );
}

export function CookTimers({ children, empty }: { children: ReactNode; empty: string }) {
  return (
    <section aria-labelledby="cook-timers" className="flex flex-col gap-4">
      <h2 id="cook-timers" className="label text-ink-muted">
        Timers
      </h2>
      {children || <p className="text-small text-ink-muted italic">{empty}</p>}
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
  onDismiss,
}: {
  label: string;
  digits: string;
  fraction: number;
  done: boolean;
  flash: boolean;
  large: boolean;
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
    <div role="group" aria-label={label} className="flex flex-col items-center gap-2">
      <div className={cx("relative grid size-56 place-items-center rounded-full transition-colors duration-150", tone)}>
        <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" fill="none" strokeWidth="9">
          <circle cx="100" cy="100" r={R} className="stroke-rule" />
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
          <p className="font-display text-[3.25rem] leading-none [font-variant-numeric:lining-nums_tabular-nums]">{done ? "Done" : digits}</p>
          <p className="label mt-2 max-w-40 truncate">{label}</p>
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
    <footer className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-4 border-t border-rule bg-paper px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:-mx-12 lg:px-12">
      <p className="min-w-0 flex-1 basis-80 text-small text-ink-muted lg:text-deck [overflow-wrap:anywhere]">{next === undefined ? (
          "Last step"
        ) : (
          <>
            Next · <span className="text-ink">{next}</span>
          </>
        )}
      </p>
      <div className="flex gap-3">{children}</div>
    </footer>
  );
}

const pill = "label inline-flex min-h-15 min-w-32 items-center justify-center gap-2 rounded-full px-8 text-body disabled:cursor-not-allowed disabled:opacity-55";
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
