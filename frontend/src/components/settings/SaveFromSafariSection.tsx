import { Heading } from "@/components/ui/Heading";
import { TextLink } from "@/components/ui/TextLink";
import { Text } from "@/components/ui/Text";

/** Pointer to the page that sets up the Shortcut and the bookmarklet. */
export function SaveFromSafariSection() {
  return (
    <section aria-labelledby="share-heading" className="flex flex-col gap-4">
      <Heading level={2} id="share-heading" ruled>
        Save from Safari
      </Heading>
      <Text>Send a recipe here from the Share menu on an iPad or iPhone, or from a bookmark on a computer.</Text>
      <p>
        <TextLink href="/settings/share">Set up saving from Safari</TextLink>
      </p>
    </section>
  );
}
