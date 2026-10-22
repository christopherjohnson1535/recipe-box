import type { ComponentProps, ReactNode } from "react";

/**
 * Where toasts appear: a polite live region pinned to the bottom of the screen. It stays mounted (empty) so a toast
 * that arrives later is announced. Hidden when printing.
 */
export function ToastRegion({ children }: { children?: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-gutter pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"
    >
      {children}
    </div>
  );
}

/** A short message with actions, inverse (ink on paper in reverse). Long titles wrap and stop at two lines. */
export function Toast({ children, actions, ...rest }: ComponentProps<"div"> & { actions?: ReactNode }) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-measure items-center gap-1 bg-(--toast-bg) py-1 ps-4 pe-1 text-small text-(--toast-fg) border border-(--toast-fg)/20"
      {...rest}
    >
      <p className="min-w-0 flex-1 line-clamp-2 py-2 [overflow-wrap:anywhere]">{children}</p>
      {actions}
    </div>
  );
}

const focus = "focus-visible:outline-(--toast-focus)";

/** Text action in a toast ("Undo"): underlined, 44px tall. */
export function ToastAction({ type = "button", ...rest }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`label min-h-control shrink-0 px-3 text-(--toast-action-fg) underline underline-offset-[0.3em] hover:decoration-2 disabled:opacity-55 ${focus}`}
      {...rest}
    />
  );
}

/** 44px close cross for a toast. */
export function ToastDismiss({ label = "Dismiss", ...rest }: Omit<ComponentProps<"button">, "children"> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-control shrink-0 items-center justify-center text-(--toast-action-fg) ${focus}`}
      {...rest}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
