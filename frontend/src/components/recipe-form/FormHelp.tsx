import { Heading } from "@/components/ui/Heading";
import { AsidePanel } from "@/components/ui/Columns";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";

/** The side note beside the recipe editor on wide screens: the paste shortcuts and where an unsaved page goes. */
export function FormHelp({ editing }: { editing?: boolean }) {
  return (
    <AsidePanel optional label="Tips for the recipe form">
      <Heading level={2} size="label">
        Good to know
      </Heading>
      <Text variant="small">Paste a whole ingredient list into an ingredient box and it is split into one line each. Start a section for headings like “For the sauce”.</Text>
      <Text variant="small">Paste numbered steps into a step box and they are split and renumbered.</Text>
      <Text variant="small">If you leave by accident, your unsaved changes are offered back when you return to this page.</Text>
      {!editing && (
        <Text variant="small">
          Have a link, a photo or some pasted text instead? <TextLink href="/import">Import a recipe</TextLink>.
        </Text>
      )}
    </AsidePanel>
  );
}
