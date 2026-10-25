"use client";

import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api as browserApi, ApiError, type Api, type Role, type User } from "@/lib/api";
import { MIN_PASSWORD } from "./PasswordForm";

type Errors = { displayName?: string; username?: string; email?: string; password?: string; form?: string };
const FIELDS = ["displayName", "username", "email", "password"] as const;
const USERNAME = /^[a-z0-9_.-]{3,40}$/;

type Props = { onAdded: (user: User) => void; api?: Pick<Api, "createUser"> };

/** Adds a household member with a temporary password. Same username rules as first-run setup. */
export function AddMemberForm({ onAdded, api = browserApi }: Props) {
  const [errors, setErrors] = useState<Errors>({});
  const [role, setRole] = useState<Role>("member");
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const focus = (name: string) => formRef.current?.querySelector<HTMLInputElement>(`[name=${name}]`)?.focus();
  const fail = (e: Errors) => {
    setErrors(e);
    const first = FIELDS.find((f) => e[f]);
    if (first) focus(first);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get("displayName")).trim();
    const username = String(data.get("username")).trim();
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    const next: Errors = {};
    if (!displayName) next.displayName = "Enter a name.";
    if (!USERNAME.test(username)) next.username = "Use 3–40 characters: lowercase letters, numbers, . _ -";
    if ([...password].length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (Object.keys(next).length > 0) return fail(next);

    setPending(true);
    setErrors({});
    try {
      const user = await api.createUser({ displayName, username, password, role, ...(email && { email }) });
      form.reset();
      setRole("member");
      onAdded(user);
      focus("displayName");
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict")
        fail(email && /email/i.test(e.message) ? { email: "Another member already uses that email." } : { username: "That username is taken. Pick another." });
      else if (e instanceof ApiError && e.code === "validation") {
        const m = e.message.match(/^(\w+): (.+)$/);
        const field = m && (FIELDS as readonly string[]).includes(m[1]) ? (m[1] as (typeof FIELDS)[number]) : null;
        fail(field ? { [field]: m![2] } : { form: e.message });
      } else fail({ form: e instanceof ApiError ? e.message : "Couldn’t add the member. Try again." });
    } finally {
      setPending(false);
    }
  }

  const describe = (name: keyof Errors, hint = false) => (errors[name] || hint ? `${name}-msg` : undefined);
  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="flex max-w-measure flex-col gap-5">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <Field label="Name" htmlFor="displayName" hint="Shown on recipes they add, e.g. “Sam”." error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="off"
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={describe("displayName", true)}
        />
      </Field>
      <Field label="Username" htmlFor="username" hint="3–40 characters: lowercase letters, numbers, . _ -" error={errors.username}>
        <Input
          id="username"
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
          aria-invalid={errors.username ? true : undefined}
          aria-describedby={describe("username", true)}
        />
      </Field>
      <Field label="Google email (optional)" htmlFor="email" hint="Lets them sign in with the Google account that has this address." error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe("email", true)}
        />
      </Field>
      <Field
        label="Temporary password"
        htmlFor="password"
        hint={`At least ${MIN_PASSWORD} characters. Tell them in person; they can change it under My account.`}
        error={errors.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describe("password", true)}
        />
      </Field>
      <ChoiceGroup
        legend="Role"
        name="role"
        value={role}
        onChange={setRole}
        options={[
          { value: "member", label: "Member", hint: "Cooks, adds and edits recipes." },
          { value: "admin", label: "Admin", hint: "Also manages household members." },
        ]}
      />
      <div>
        <Button type="submit" pending={pending}>
          {pending ? "Adding…" : "Add member"}
        </Button>
      </div>
    </form>
  );
}
