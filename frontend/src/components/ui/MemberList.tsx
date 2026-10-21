import type { ReactNode } from "react";

/** A list of people separated by hairlines. Pair with MemberItem. */
export function MemberList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-col border-t border-(--rule-hair)">
      {children}
    </ul>
  );
}

type MemberItemProps = {
  name: string;
  /** Muted line under the name: username, role. */
  detail: string;
  /** Small uppercase marker next to the name, e.g. "You". */
  marker?: string;
  /** Buttons for the row. */
  actions?: ReactNode;
  /** An explanation under the row, such as why Remove is off. */
  note?: ReactNode;
  /** A panel opened from the row (reset password, confirm removal). */
  panel?: ReactNode;
};

export function MemberItem({ name, detail, marker, actions, note, panel }: MemberItemProps) {
  return (
    <li className="flex flex-col gap-3 border-b border-(--rule-hair) py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-3 text-body font-semibold text-ink">
            <span className="break-words">{name}</span>
            {marker && <span className="label text-(--kicker-fg)">{marker}</span>}
          </p>
          <p className="text-small break-all text-ink-muted">{detail}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {note && <p className="text-small text-ink-muted italic">{note}</p>}
      {panel}
    </li>
  );
}
