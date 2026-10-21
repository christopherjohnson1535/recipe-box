import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Cooking mode" };

export default function CookPage() {
  return (
    <Placeholder title="Cooking mode" coming="Large-text, step-by-step cooking with the screen kept awake" issues="KIT" />
  );
}
