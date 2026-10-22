import { Pending } from "@/components/ui/Pending";

/** Shown while a page waits for the API; same column as every page so nothing shifts when the page arrives. */
export default function Loading() {
  return <Pending>Loading…</Pending>;
}
