import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <Placeholder title="Import a recipe" coming="Import from a link, a photo or pasted text" issues="LNK and PHO" />;
}
