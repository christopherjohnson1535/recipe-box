"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.setup({
        username: String(form.get("username")).trim(),
        displayName: String(form.get("displayName")).trim(),
        password: String(form.get("password")),
      });
      router.replace("/");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "forbidden") {
        router.replace("/login"); // someone finished setup first
        return;
      }
      setError(e instanceof ApiError ? e.message : "Setup failed. Try again.");
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Your name" htmlFor="displayName" hint="Shown on recipes you add, e.g. “Chris”.">
        <Input id="displayName" name="displayName" autoComplete="name" required aria-describedby="displayName-msg" />
      </Field>
      <Field label="Username" htmlFor="username" hint="3–40 characters: lowercase letters, numbers, . _ -">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={40}
          pattern="[a-z0-9_.\-]+"
          aria-describedby="username-msg"
        />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="password-msg"
        />
      </Field>
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Creating account…" : "Create admin account"}
      </Button>
    </form>
  );
}
