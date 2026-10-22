"use client";

import { useEffect } from "react";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";

export function ErrorContent({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <EmptyState level={1} title="Something went wrong" actions={<Button onClick={() => retry()}>Try again</Button>}>
      <p>The page hit an unexpected error. Try again, or reload if it keeps happening.</p>
    </EmptyState>
  );
}
