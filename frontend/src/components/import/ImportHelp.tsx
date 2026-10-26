import { AsidePanel } from "@/components/ui/Columns";
import { Heading } from "@/components/ui/Heading";
import { Step, Steps } from "@/components/ui/Steps";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";

/**
 * The side note beside the import form on wide screens: what happens after the button. With AI off (the default) only
 * links are read and photos are kept to type from, so the note says that instead of promising a reading.
 */
export function ImportHelp({ aiOff }: { aiOff: boolean }) {
  return (
    <AsidePanel hideBelow="md" label="How importing works">
      <Heading level={2} size="label">
        What happens next
      </Heading>
      <Steps>
        <Step n={1}>
          <p>
            <Text as="span" variant="strong">
              Add it.
            </Text>{" "}
            {aiOff ? "A link to the recipe, or photos to type it in from." : "A link to the recipe, photos of a cookbook page or card, or the text itself."}
          </p>
        </Step>
        <Step n={2}>
          <p>
            <Text as="span" variant="strong">
              Check the draft.
            </Text>{" "}
            {aiOff ? "A link is read into a draft you can correct; photos sit beside an empty recipe." : "It is read into a draft you can correct."} Nothing is saved yet.
          </p>
        </Step>
        <Step n={3}>
          <p>
            <Text as="span" variant="strong">
              Save it.
            </Text>{" "}
            Press Save and it joins your recipe box.
          </p>
        </Step>
      </Steps>
      <Text variant="small">
        Prefer to type it in? <TextLink href="/recipes/new">Add a recipe by hand</TextLink>.
      </Text>
    </AsidePanel>
  );
}
