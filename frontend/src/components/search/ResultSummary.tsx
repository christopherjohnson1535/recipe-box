import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export function NoMatches({ q, tag, favourite = false }: { q: string; tag: string; favourite?: boolean }) {
  if (favourite && !q && !tag) {
    // The filter alone, and nothing starred yet: say how to star, not how to search.
    return (
      <EmptyState
        title="No favourites yet"
        actions={
          <ButtonLink href="/" variant="secondary">
            Show all recipes
          </ButtonLink>
        }
      >
        <p role="status">Tap the star on a recipe to keep it here. Your favourites are yours alone, and they stay on this device for when you’re offline.</p>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title={favourite ? "None of your favourites match" : "No recipes match"}
      actions={
        <ButtonLink href="/" variant="secondary">
          Clear search
        </ButtonLink>
      }
    >
      <p role="status">
        {q ? `Nothing matches “${q}”` : "Nothing"}
        {tag ? ` tagged ${tag}` : ""}
        {favourite ? " among your favourites" : ""}. Try a different word or another tag.
      </p>
    </EmptyState>
  );
}
