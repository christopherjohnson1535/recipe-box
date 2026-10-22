import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-page px-gutter py-16">
      <NotFoundContent />
    </main>
  );
}
