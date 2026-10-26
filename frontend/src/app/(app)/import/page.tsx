import type { Metadata } from "next";
import { ImportScreen } from "@/components/import/ImportScreen";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseSharedUrl } from "@/lib/shared-url";

export const metadata: Metadata = { title: "Import" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const mode = first(params.mode);
  const rawUrl = first(params.url)?.trim() ?? "";
  const sharedUrl = parseSharedUrl(rawUrl);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader kicker="Recipes" title="Import a recipe" description="From a link, a photo or pasted text. You check the result before anything is saved." />
      <ImportScreen initialMode={mode === "photo" || mode === "text" ? mode : "link"} initialUrl={sharedUrl ?? ""} sharedRejected={rawUrl !== "" && sharedUrl === null} />
    </div>
  );
}
