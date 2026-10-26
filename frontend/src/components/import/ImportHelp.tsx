import { AsidePanel } from "@/components/ui/Columns";
import { Heading } from "@/components/ui/Heading";
import { Step, Steps } from "@/components/ui/Steps";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";

/** The side note beside the import form on wide screens: what happens after the button. */
export function ImportHelp() {
  return (
    <AsidePanel optional label="How importing works">
      <Heading level={2} size="label">
        What happens next
      </Heading>
      <Steps>
        <Step n={1}>
          <p>
            <Text as="span" variant="strong">
              Add it.
            </Text>{" "}
            A link to the recipe, photos of a cookbook page or card, or the text itself.
          </p>
        </Step>
        <Step n={2}>
          <p>
            <Text as="span" variant="strong">
              Check the draft.
            </Text>{" "}
            It is read into a draft you can correct. Nothing is saved yet.
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
