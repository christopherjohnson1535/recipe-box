"use client";

import { ErrorContent } from "@/components/ErrorContent";

export default function Error(props: { error: unknown; retry: () => void }) {
  return (
    <main id="main" className="mx-auto w-full max-w-content px-gutter py-16">
      <ErrorContent {...props} />
    </main>
  );
}
