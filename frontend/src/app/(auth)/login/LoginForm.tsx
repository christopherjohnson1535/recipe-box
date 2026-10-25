"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api.login({ username: String(form.get("username")), password: String(form.get("password")) });
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "unauthenticated"
          ? "That username and password don’t match. Check them and try again."
          : e instanceof ApiError && e.code === "rate_limited"
            ? // The server's message says how long to wait ("Too many attempts. Try again in 5 minutes.").
              e.message
            : e instanceof ApiError
              ? e.message
              : "Sign-in failed. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Username" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
