import { ButtonLink } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";

export function NotFoundContent() {
  return (
    <EmptyState
      level={1}
      title="Page not found"
      actions={<ButtonLink href="/">Back to recipes</ButtonLink>}
    >
      <p>This page doesn’t exist, or the recipe was deleted.</p>
    </EmptyState>
  );
}
