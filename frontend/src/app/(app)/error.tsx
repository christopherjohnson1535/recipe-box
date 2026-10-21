"use client";

import { ErrorContent } from "@/components/ErrorContent";

export default function Error(props: { error: unknown; retry: () => void }) {
  return <ErrorContent {...props} />;
}
