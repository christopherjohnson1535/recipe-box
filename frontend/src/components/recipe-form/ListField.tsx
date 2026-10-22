"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { EditorItem, EditorList } from "@/components/ui/ListEditor";
import { Fieldset } from "@/components/ui/Fieldset";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { insertAfter, moveRow, newRow, pasteLines, removeRow, setHeading, setText, splitLines, type Row } from "./list-model";

type ListFieldProps = {
  idPrefix: string;
  legend: string;
  hint: string;
  /** "Ingredient" or "Step": names the row's controls for screen readers. */
  itemLabel: string;
  addLabel: string;
  placeholder: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  /** Steps are paragraphs (textarea, numbered); ingredients are one line each. */
  multiline?: boolean;
};

/** Editable list with optional section headings, move up/down, remove, and block paste that splits into rows. */
export function ListField({ idPrefix, legend, hint, itemLabel, addLabel, placeholder, rows, onChange, multiline }: ListFieldProps) {
  const focus = useRef<string | null>(null);
  const [note, setNote] = useState("");
  // A trailing zero-width space alternates so two identical messages in a row are still announced.
  const announce = (text: string) => setNote((n) => text + (n.endsWith("\u200b") ? "" : "\u200b"));
  useEffect(() => {
    if (focus.current) document.getElementById(focus.current)?.focus();
    focus.current = null;
  });

  const lower = itemLabel.toLowerCase();
  const id = (key: string, part: string) => `${idPrefix}-${key}-${part}`;
  const change = (next: Row[], focusId?: string) => {
    focus.current = focusId ?? null;
    onChange(next);
  };

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    const key = rows[i].key;
    // At the end of the list the pressed button is disabled, so focus its partner instead.
    const part = by < 0 ? (j === 0 ? "down" : "up") : j === rows.length - 1 ? "up" : "down";
    announce(`${itemLabel} moved to position ${j + 1} of ${rows.length}.`);
    change(moveRow(rows, i, by), id(key, part));
  }

  function remove(i: number) {
    announce(`${itemLabel} ${i + 1} removed.`);
    const near = rows[i - 1] ?? rows[i + 1];
    change(removeRow(rows, i), near ? id(near.key, "text") : `${idPrefix}-add`);
  }

  function paste(e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, i: number) {
    const lines = splitLines(e.clipboardData.getData("text"));
    if (lines.length < 2) return; // one line pastes normally
    e.preventDefault();
    const el = e.currentTarget;
    const replace = el.value === "" || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
    const result = pasteLines(rows, i, lines, replace);
    announce(`${lines.length} ${lower}s added.`);
    change(result.rows, id(result.focus, "text"));
  }

  return (
    <Fieldset legend={legend} hint={hint}>
      <EditorList>
        {rows.map((row, i) => {
          // Does a named section run into this row? Then a blank heading here ends it.
          const inSection = rows.slice(0, i).reduce<boolean>((s, r) => (r.heading === null ? s : r.heading.trim() !== ""), false);
          const endsSection = row.heading === "" && inSection;
          const common = {
            id: id(row.key, "text"),
            maxLength: 2000, // backend MAX_LINE
            "aria-label": `${itemLabel} ${i + 1}`,
            placeholder,
            value: row.text,
            onPaste: (e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => paste(e, i),
          };
          return (
            <EditorItem
              key={row.key}
              number={multiline ? i + 1 : undefined}
              heading={
                row.heading !== null && (
                  <div className="flex gap-2">
                    <Input
                      id={id(row.key, "heading")}
                      aria-label={`Section heading above ${lower} ${i + 1}`}
                      placeholder={endsSection ? "No heading: continues without a section" : "Section heading, e.g. For the sauce…"}
                      value={row.heading}
                      onChange={(e) => change(setHeading(rows, i, e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                        e.preventDefault(); // Enter must not save the recipe; move on to the row
                        document.getElementById(id(row.key, "text"))?.focus();
                      }}
                    />
                    <IconButton
                      icon="remove"
                      label={
                        endsSection
                          ? `Join ${lower} ${i + 1} to the previous section`
                          : `Remove section heading above ${lower} ${i + 1}`
                      }
                      onClick={() => {
                        if (endsSection) announce(`${itemLabel} ${i + 1} now belongs to the previous section.`);
                        change(setHeading(rows, i, null), id(row.key, "text"));
                      }}
                    />
                  </div>
                )
              }
              controls={
                <>
                  {row.heading === null && (
                    <Button
                      variant="ghost"
                      aria-label={`Start a section at ${lower} ${i + 1}`}
                      onClick={() => change(setHeading(rows, i, ""), id(row.key, "heading"))}
                    >
                      Section
                    </Button>
                  )}
                  <IconButton
                    id={id(row.key, "up")}
                    icon="up"
                    label={`Move ${lower} ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    id={id(row.key, "down")}
                    icon="down"
                    label={`Move ${lower} ${i + 1} down`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton icon="remove" label={`Remove ${lower} ${i + 1}`} onClick={() => remove(i)} />
                </>
              }
            >
              {multiline ? (
                <Textarea {...common} onChange={(e) => change(setText(rows, i, e.target.value))} />
              ) : (
                <Input
                  {...common}
                  onChange={(e) => change(setText(rows, i, e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing) return; // Enter that confirms an IME choice is not ours
                    e.preventDefault(); // Enter adds the next row instead of submitting the form
                    const next = insertAfter(rows, i);
                    change(next.rows, id(next.focus, "text"));
                  }}
                />
              )}
            </EditorItem>
          );
        })}
      </EditorList>
      <div className="flex">
        <Button
          id={`${idPrefix}-add`}
          variant="secondary"
          disabled={rows.length >= 500} // backend MAX_LINES
          onClick={() => {
            const row = newRow();
            change([...rows, row], id(row.key, "text"));
          }}
        >
          {addLabel}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {note}
      </p>
    </Fieldset>
  );
}
