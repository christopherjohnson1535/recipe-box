import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Edit recipe" };

export default function EditRecipePage() {
  return <Placeholder title="Edit recipe" coming="Editing recipes" issues="REC" />;
}
