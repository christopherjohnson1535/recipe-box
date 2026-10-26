"use client";

import { useSyncExternalStore } from "react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { type EditionPreference, getEditionPreference, setEditionPreference, subscribeEdition } from "@/lib/edition";

const OPTIONS = [
  { value: "clock", label: "By the clock: evening colours after 7 pm", hint: "Day colours from 7 am, evening colours from 7 pm." },
  { value: "day", label: "Always day" },
  { value: "evening", label: "Always evening" },
  { value: "device", label: "Follow this device", hint: "Uses the light or dark setting of this iPad or computer." },
] as const;

/** Whether this device shows the day (light) or evening (dark) colours. Saved on this device only, applied at once. */
export function AppearanceSection() {
  const pref = useSyncExternalStore(subscribeEdition, getEditionPreference, () => "clock" as EditionPreference);
  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
      <Heading level={2} id="appearance-heading" ruled>
        Appearance
      </Heading>
      <Text>Pick when Recipe Box uses its lighter day colours and its darker evening colours. This is remembered on this device only.</Text>
      <ChoiceGroup legend="Colours" name="appearance" value={pref} onChange={setEditionPreference} options={OPTIONS} />
    </section>
  );
}
