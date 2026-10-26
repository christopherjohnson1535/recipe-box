import { Heading } from "@/components/ui/Heading";
import { AsidePanel } from "@/components/ui/Columns";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";

/**
 * The side note beside the recipe editor on wide screens only (stacked, it would sit after Save). The paste shortcuts are
 * already hinted under the Ingredients and Method fields, so this holds what the fields do not say.
 */
export function FormHelp({ editing }: { editing?: boolean }) {
  return (
    <AsidePanel hideBelow="xl" label="Tips for the recipe form">
      <Heading level={2} size="label">
        Good to know
      </Heading>
      <Text variant="small">If you leave by accident, your unsaved changes are offered back when you return to this page.</Text>
      {!editing && (
        <Text variant="small">
          Have a link, a photo or some pasted text instead? <TextLink href="/import">Import a recipe</TextLink>.
        </Text>
      )}
    </AsidePanel>
  );
}
