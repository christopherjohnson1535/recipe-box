import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Add a recipe" };

export default function NewRecipePage() {
  return <Placeholder title="Add a recipe" coming="Typing in a recipe by hand" issues="REC" />;
}
