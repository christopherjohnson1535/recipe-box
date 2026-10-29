import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Favourites (REC-5): the star, how it sits on a tile and on the recipe page, and the "Favourites" filter beside the
// tags. Starred is the accent star, filled; not starred is a muted ink outline. A star the reader just turned on (`pop`)
// lands with a small press (`star-pop` in motion.css); under reduced motion it only changes colour.

/**
 * The five-point star, 20px. Filled when `on`; `pop` plays the landing press (set it only right after the reader turned it
 * on). Decorative: the control around it carries the name and state.
 */
export function Star({ on, pop = false }: { on: boolean; pop?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={
        on && pop
          ? "star-pop size-5 shrink-0 fill-(--star-fg) stroke-(--star-fg) [stroke-linejoin:round] [stroke-width:1.5]"
          : on
          ? "size-5 shrink-0 fill-(--star-fg) stroke-(--star-fg) [stroke-linejoin:round] [stroke-width:1.5]"
          : "size-5 shrink-0 fill-none stroke-(--star-line) [stroke-linejoin:round] [stroke-width:1.5]"
      }
    >
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

type ToggleProps = Omit<ComponentProps<"button">, "type" | "className" | "aria-pressed" | "children"> & {
  on: boolean;
  /** Just turned on by the reader: the star lands with a press. */
  pop?: boolean;
};

/**
 * The star on a recipe tile: a 44px icon button at the right of the kicker line, above the card's link (the whole card
 * is a link). `aria-label` names the recipe ("Favourite: Lentil soup"); `aria-pressed` says whether it is starred.
 */
export function TileStar({ on, pop, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className="relative z-10 -my-3 -me-3 inline-flex size-control shrink-0 items-center justify-center rounded-control transition-opacity duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 print:hidden pointer-fine:[&:hover:not(:disabled)>svg]:stroke-(--star-fg)"
      {...rest}
    >
      <Star on={on} pop={pop} />
    </button>
  );
}

/**
 * The recipe page's star: "Favourite" as a quiet label beside the opener's other actions, 44px tall, the star before the
 * word. The word never changes (speech control keeps finding it); the filled star and `aria-pressed` carry the state.
 * Where several recipes share a screen (the featured recipe on home) pass an `aria-label` that names the recipe.
 */
export function FavouriteToggle({ on, pop, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className="label-quiet inline-flex min-h-control items-center gap-2 text-(--button-ghost-fg) transition-[color,opacity] duration-150 ease-out pointer-fine:hover:text-(--button-ghost-hover) disabled:cursor-not-allowed disabled:opacity-55 print:hidden"
      {...rest}
    >
      <Star on={on} pop={pop} />
      Favourite
    </button>
  );
}

/**
 * The "Favourites" filter: a toggle set apart from the tag chips (a pill with a hairline outline, then a hairline
 * divider before the tags), so it never reads as one of them. On, it fills with the panel colour, its outline turns
 * ink and the star fills; the tag row beside it keeps its own single selection ("All" means all tags). A link (with
 * `aria-current` while on), so it works before scripts load and keeps the search in the URL.
 */
export function FavouritesChip({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={
        selected
          ? "label-quiet inline-flex min-h-control items-center gap-2 rounded-full border border-(--color-ink) bg-(--panel-bg) px-4 font-semibold text-(--chip-fg-selected) transition-[border-color,background-color,color] duration-150 ease-out"
          : "label-quiet inline-flex min-h-control items-center gap-2 rounded-full border border-(--color-rule-strong) px-4 text-(--chip-fg) transition-[border-color,background-color,color] duration-150 ease-out pointer-fine:hover:border-(--color-ink) pointer-fine:hover:text-(--chip-fg-hover)"
      }
    >
      <Star on={selected} />
      {children}
    </Link>
  );
}

/** The Favourites toggle and the tag chips side by side, with a hairline between them (stacked on a phone). */
export function FilterGroups({ favourites, children }: { favourites: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="shrink-0 sm:border-r sm:border-(--rule-hair) sm:pr-5">{favourites}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
