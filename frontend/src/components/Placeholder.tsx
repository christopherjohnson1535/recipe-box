import { ButtonLink } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { PageHeader } from "./ui/PageHeader";

/** Honest stand-in for a page a later GitHub issue builds. */
export function Placeholder({ title, coming, issues }: { title: string; coming: string; issues: string }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} />
      <EmptyState
        title="Not built yet"
        actions={
          <ButtonLink href="/" variant="secondary">
            Back to recipes
          </ButtonLink>
        }
      >
        <p>
          {coming} — coming in the <strong className="font-semibold text-text">{issues}</strong> issues.
        </p>
      </EmptyState>
    </div>
  );
}
