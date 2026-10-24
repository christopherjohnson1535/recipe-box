"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Checkbox } from "@/components/ui/Checkbox";
import { Heading } from "@/components/ui/Heading";
import { api as browserApi, ApiError, type Api } from "@/lib/api";

type Props = { initial: boolean; api?: Pick<Api, "updateSettings"> };

/** Admin only: whether every recipe photo is shown with the print treatment. Originals are always kept. */
export function PhotosSection({ initial, api = browserApi }: Props) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle(next: boolean) {
    const before = on;
    setOn(next); // optimistic
    setError(null);
    setSaving(true);
    try {
      await api.updateSettings({ plateTreatment: next });
      router.refresh();
    } catch (e) {
      setOn(before);
      setError(e instanceof ApiError ? e.message : "Couldn’t save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="photos-heading" className="flex flex-col gap-4">
      <Heading level={2} id="photos-heading" ruled>
        Photos
      </Heading>
      {error && <Alert tone="error">{error}</Alert>}
      <Checkbox
        checked={on}
        onChange={(next) => void toggle(next)}
        disabled={saving}
        label="Give every recipe photo the print look"
        hint="One paper-and-ink finish for the whole household. Originals are always kept; tap View the original photo on a recipe to see one."
      />
    </section>
  );
}
