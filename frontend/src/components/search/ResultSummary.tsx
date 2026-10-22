import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { resultSummary } from "./url";

/** The result count, announced politely as it changes while the person types. */
export function ResultSummary({ total, q, tag }: { total: number; q: string; tag: string }) {
  return (
    <div role="status">
      <Text variant="meta">{resultSummary(total, q, tag)}</Text>
    </div>
  );
}

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
