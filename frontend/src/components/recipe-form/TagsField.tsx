"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { TagList } from "@/components/ui/TagList";
import { addTags } from "./list-model";

type TagsFieldProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Text typed but not yet turned into a tag. Lives in the form so Save can include it. */
  draft: string;
  onDraft: (draft: string) => void;
  suggestions: string[];
};

/** Tags typed with comma or Enter, removable, with the household's existing tags as suggestions. */
export function TagsField({ tags, onChange, draft, onDraft, suggestions }: TagsFieldProps) {
  const commit = (raw: string) => {
    onChange(addTags(tags, raw));
    onDraft("");
  };
  return (
    <Field label="Tags" htmlFor="rf-tags" hint="Type a tag, then press comma or Enter. Pick one you have used before, or make a new one.">
      <TagList tags={tags} onRemove={(t) => onChange(tags.filter((x) => x !== t))} />
      <Input
        id="rf-tags"
        list="rf-tag-options"
        autoComplete="off"
        autoCapitalize="none"
        aria-describedby="rf-tags-msg"
        placeholder="dinner, quick, vegetarian…"
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          const cut = v.lastIndexOf(",");
          if (cut < 0) return onDraft(v);
          onChange(addTags(tags, v.slice(0, cut)));
          onDraft(v.slice(cut + 1));
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault(); // Enter makes the tag; it must not submit the form
          if (draft.trim()) commit(draft);
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />
      <datalist id="rf-tag-options">
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </Field>
  );
}
