import { IconButton } from "./IconButton";

/** The tags on a recipe being edited, each with a remove button. */
export function TagList({ tags, onRemove }: { tags: string[]; onRemove: (index: number) => void }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-x-4 gap-y-1">
      {tags.map((tag, i) => (
        <li key={tag} className="label inline-flex items-center border-b border-(--chip-underline-hover) pl-1 text-(--chip-fg)">
          {tag}
          <IconButton quiet id={`rf-tag-remove-${i}`} icon="remove" label={`Remove tag ${tag}`} onClick={() => onRemove(i)} />
        </li>
      ))}
    </ul>
  );
}
