"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { DownloadButton, FileButton } from "@/components/ui/FileButton";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { api as browserApi, ApiError, type Api } from "@/lib/api";

type Props = { api?: Pick<Api, "importExport"> };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Admin only: one zip of every recipe and photo, and the way back in. The download is a plain link, so the browser
 * streams the file to disk instead of holding it in memory; the session cookie goes with it.
 */
export function ExportSection({ api = browserApi }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  async function pick(file: File) {
    setError(null);
    setDone(null);
    setPending(true);
    try {
      const { imported, skipped } = await api.importExport(file);
      setDone(
        imported === 0 && skipped === 0
          ? "That export had no recipes."
          : `Added ${plural(imported, "recipe", "recipes")}${skipped ? `; skipped ${plural(skipped, "recipe", "recipes")} already in the box` : ""}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t import that file. Nothing was added.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="export-heading" className="flex flex-col gap-4">
      <Heading level={2} id="export-heading" ruled>
        Export and import
      </Heading>
      <Text>
        Save every recipe and photo as one zip file, or add the recipes from one. Importing never overwrites. Into the box the file came from, recipes already there are skipped; into another box, every recipe
        is added. If anything in the file is wrong, nothing is added.
      </Text>
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert>{done}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        {/* A real download, not fetch: the zip can be large. */}
        <DownloadButton href="/api/export">Download export</DownloadButton>
        <FileButton accept=".zip,application/zip" disabled={pending} onFile={(file) => void pick(file)}>
          {pending ? "Importing…" : "Import export"}
        </FileButton>
      </div>
      <Text variant="small">Exports hold recipes and photos, not accounts or settings. Large files can take a minute to import.</Text>
    </section>
  );
}
