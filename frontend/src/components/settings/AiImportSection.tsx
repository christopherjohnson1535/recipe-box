import { ExternalLink } from "@/components/ui/ExternalLink";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import type { Capabilities } from "@/lib/api";

const WIKI = "https://github.com/christopherjohnson1535/recipe-box/wiki/AI-Photo-Import";

/** Whether reading recipes from photos is switched on, in plain words. `null` means the server didn't say. */
export function AiImportSection({ capabilities }: { capabilities: Capabilities | null }) {
  return (
    <section aria-labelledby="ai-heading" className="flex flex-col gap-4">
      <Heading level={2} id="ai-heading" ruled>
        AI import
      </Heading>
      {capabilities === null ? (
        <Text variant="note">Couldn’t check whether AI import is on. Reload the page to try again.</Text>
      ) : capabilities.ai ? (
        <Text>
          AI import is <Text as="span" variant="strong">on</Text>, using {capabilities.provider === "anthropic" ? "Anthropic" : capabilities.provider}. Photos and
          pasted text can be turned into a recipe draft. You always check the draft before it is saved.
        </Text>
      ) : (
        <>
          <Text>
            AI import is <Text as="span" variant="strong">off</Text>. Links to pages that carry recipe data still import, and you can type recipes in by hand. Photos are saved with the recipe
            but not read.
          </Text>
          <Text variant="small">
            An admin turns it on by setting <code>AI_PROVIDER</code> on the server. Steps are on the{" "}
            <ExternalLink href={WIKI}>AI Photo Import</ExternalLink> wiki page.
          </Text>
        </>
      )}
    </section>
  );
}
