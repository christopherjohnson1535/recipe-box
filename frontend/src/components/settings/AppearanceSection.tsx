"use client";

import { useSyncExternalStore } from "react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { type EditionPreference, getEditionPreference, setEditionPreference, subscribeEdition } from "@/lib/edition";

const OPTIONS = [
  { value: "clock", label: "By the clock — evening after 7 pm", hint: "Day edition from 7 am, evening edition from 7 pm." },
  { value: "day", label: "Always day" },
  { value: "evening", label: "Always evening" },
  { value: "device", label: "Follow this device", hint: "Uses the light or dark setting of this iPad or computer." },
] as const;

/** Which edition (light or dark) this device shows. Saved on this device only, applied at once. */
export function AppearanceSection() {
  const pref = useSyncExternalStore(subscribeEdition, getEditionPreference, () => "clock" as EditionPreference);
  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
      <Heading level={2} id="appearance-heading" ruled>
        Appearance
      </Heading>
      <Text>Pick when Recipe Box shows its lighter day edition and its darker evening edition. This is remembered on this device only.</Text>
      <ChoiceGroup legend="Edition" name="edition" value={pref} onChange={setEditionPreference} options={OPTIONS} />
    </section>
  );
}
