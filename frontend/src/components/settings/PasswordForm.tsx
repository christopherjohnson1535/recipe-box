"use client";

import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api as browserApi, ApiError, type Api } from "@/lib/api";

export const MIN_PASSWORD = 10;

type Props = {
  userId: string;
  /** Your own password: asks for the current one. An admin resetting someone else's leaves it out. */
  askCurrent: boolean;
  submitLabel: string;
  /** Called after the API accepted the new password. */
  onDone?: () => void;
  /** Shows a "cancel" button (the reset panel). */
  onCancel?: () => void;
  /** Prefix for element ids, so several forms can sit on one page. */
  idPrefix: string;
  api?: Pick<Api, "setPassword">;
};

type Errors = { current?: string; password?: string; confirm?: string; form?: string };

/** Change a password: current (own only), new, confirm. Errors sit on the field they belong to. */
export function PasswordForm({ userId, askCurrent, submitLabel, onDone, onCancel, idPrefix, api = browserApi }: Props) {
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = (name: string) => `${idPrefix}-${name}`;

  const focusFirst = (e: Errors) => {
    const name = e.current ? "current" : e.password ? "password" : e.confirm ? "confirm" : null;
    if (name) formRef.current?.querySelector<HTMLInputElement>(`#${id(name)}`)?.focus();
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current") ?? "");
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const next: Errors = {};
    if (askCurrent && !current) next.current = "Enter your current password.";
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (confirm !== password) next.confirm = "The two passwords don’t match.";
    setDone(false);
    setErrors(next);
    if (Object.keys(next).length > 0) return focusFirst(next);

    setPending(true);
    try {
      await api.setPassword(userId, password, askCurrent ? current : undefined);
      form.reset();
      setDone(true);
      onDone?.();
    } catch (e) {
      let failed: Errors;
      if (e instanceof ApiError && e.status === 401 && askCurrent) failed = { current: "That isn’t your current password." };
      else if (e instanceof ApiError && e.code === "validation") failed = { password: e.message.replace(/^\w+: /, "") };
      else failed = { form: e instanceof ApiError ? e.message : "Couldn’t change the password. Try again." };
      setErrors(failed);
      focusFirst(failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      {done && <Alert>Password changed.{askCurrent ? " Your other devices were signed out." : ""}</Alert>}
      {askCurrent && (
        <Field label="Current password" htmlFor={id("current")} error={errors.current}>
          <Input
            id={id("current")}
            name="current"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.current ? true : undefined}
            aria-describedby={errors.current ? `${id("current")}-msg` : undefined}
          />
        </Field>
      )}
      <Field
        label="New password"
        htmlFor={id("password")}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={errors.password}
      >
        <Input
          id={id("password")}
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={`${id("password")}-msg`}
        />
      </Field>
      <Field label="Confirm new password" htmlFor={id("confirm")} error={errors.confirm}>
        <Input
          id={id("confirm")}
          name="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? `${id("confirm")}-msg` : undefined}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
