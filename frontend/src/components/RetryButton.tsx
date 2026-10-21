"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "./ui/Button";

export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" pending={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? "Trying…" : "Try again"}
    </Button>
  );
}
