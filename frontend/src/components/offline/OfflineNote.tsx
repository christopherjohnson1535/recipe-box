"use client";

import { Text } from "@/components/ui/Text";
import { useOnline } from "./use-online";

/** The reason beside a button that needs the network, shown only while offline. `id` ties it to the button. */
export function OfflineNote({ id, children }: { id: string; children: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <Text variant="small" id={id}>
      {children}
    </Text>
  );
}
