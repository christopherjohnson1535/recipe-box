"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api as browserApi, ApiError, type Api, type User } from "@/lib/api";

type Props = {
  user: User;
  onDone: (user: User) => void;
  onCancel: () => void;
  api?: Pick<Api, "updateUserEmail">;
};

/** The API deletes a member's linked Google accounts when their email is replaced or cleared (docs/API.md). */
const DISCONNECTS = " Changing or clearing the email also disconnects their Google sign-in; they can sign in with Google again with the new email.";

/** Sets or clears the Google address that may sign in as one member. Blank removes it. */
export function EmailForm({ user, onDone, onCancel, api = browserApi }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = `email-${user.id}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    try {
      onDone(await api.updateUserEmail(user.id, email === "" ? null : email));
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "conflict"
          ? "Another member already uses that email. Each Google email can belong to one member."
          : e instanceof ApiError && e.code === "validation"
            ? "Enter an address like name@example.com, or leave it blank to remove it."
            : e instanceof ApiError
              ? e.message
              : "Couldn’t save the email. Try again.",
      );
      setPending(false);
      document.getElementById(id)?.focus();
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex max-w-measure flex-col gap-4">
      <Field
        label="Google email"
        htmlFor={id}
        hint={`The address ${user.displayName} signs in with on Google. Leave it blank to remove it.${user.email ? DISCONNECTS : ""}`}
        error={error ?? undefined}
      >
        <Input
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={user.email ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save email"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
