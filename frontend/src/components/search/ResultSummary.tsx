import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export function NoMatches({ q, tag }: { q: string; tag: string }) {
  return (
    <EmptyState
      title="No recipes match"
      actions={
        <ButtonLink href="/" variant="secondary">
          Clear search
        </ButtonLink>
      }
    >
      <p role="status">
        {q ? `Nothing matches “${q}”` : "Nothing"}
        {tag ? ` tagged ${tag}` : ""}. Try a different word or another tag.
      </p>
    </EmptyState>
  );
}
