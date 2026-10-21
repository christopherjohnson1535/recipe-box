import { ButtonLink } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { PageHeader } from "./ui/PageHeader";
import { Text } from "./ui/Text";

/** Honest stand-in for a page a later GitHub issue builds. */
export function Placeholder({ title, coming, issues }: { title: string; coming: string; issues: string }) {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader kicker="Forthcoming" title={title} description={`${coming}.`} />
      <EmptyState
        title="Not built yet"
        actions={
          <ButtonLink href="/" variant="secondary">
            Back to recipes
          </ButtonLink>
        }
      >
        <p>
          This page arrives with the <Text as="strong" variant="strong">
            {issues}
          </Text> issues.
        </p>
      </EmptyState>
    </div>
  );
}
