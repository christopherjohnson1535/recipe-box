"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";

type ConfirmInlineProps = {
  /** Says exactly what will happen and to whom: "Remove Sam? They will be signed out…". */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Two-step confirmation shown in place of the thing it affects. Focus starts on the safe choice (cancel). */
export function ConfirmInline({ children, confirmLabel, cancelLabel = "Keep", pending, onConfirm, onCancel }: ConfirmInlineProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <Panel label="Confirm">
      <p className="text-body text-ink">{children}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" pending={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel} ref={cancel}>
          {cancelLabel}
        </Button>
      </div>
    </Panel>
  );
}
