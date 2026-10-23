"use client";

import { useEffect, useState } from "react";
import { Heading } from "@/components/ui/Heading";
import { DraftList, DraftNote, DraftRow } from "@/components/ui/Darkroom";
import { Text } from "@/components/ui/Text";
import {
  flaggedRows,
  PREVIEW_ROWS,
  prefersReducedMotion,
  staggerDelays,
  LOW_CONFIDENCE,
  type Confidence,
} from "./darkroom";

const TYPE_MS = 28;

/** The title typing in, once on mount. Screen readers get the whole title at once; reduced motion shows it whole. */
function useTyped(text: string): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion() || n >= text.length) return;
    const t = setTimeout(() => setN(n + 1), TYPE_MS);
    return () => clearTimeout(t);
  }, [n, text]);
  return prefersReducedMotion() ? text : text.slice(0, n);
}

/** What the import found, filling in: the title types, ingredient rows slide in 120 ms apart, doubtful rows are flagged. */
export function DraftReveal({
  title,
  ingredients,
  confidence,
  warnings,
}: {
  title: string;
  ingredients: string[];
  confidence: Confidence;
  warnings: string[];
}) {
  const typed = useTyped(title);
  const shown = ingredients.slice(0, PREVIEW_ROWS);
  const flags = flaggedRows(confidence.ingredients, shown.length);
  const delays = staggerDelays(shown.length);
  const lowTitle = (confidence.title ?? 1) < LOW_CONFIDENCE;
  return (
    <section aria-label="What was found" className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        Draft ready: {ingredients.length}{" "}
        {ingredients.length === 1 ? "ingredient" : "ingredients"} found.
      </p>
      <Text variant="meta">Draft, not saved yet</Text>
      <Heading level={3} size="title">
        <span className="sr-only">{title}</span>
        <span aria-hidden="true">{typed}</span>
      </Heading>
      {lowTitle && (
        <Text variant="small">
          The title is uncertain (under {Math.round(LOW_CONFIDENCE * 100)}%
          sure): check it.
        </Text>
      )}
      {shown.length > 0 && (
        <DraftList>
          {shown.map((text, i) => (
            <DraftRow key={i} delay={delays[i]} flagged={flags[i]}>
              {text}
            </DraftRow>
          ))}
        </DraftList>
      )}
      {ingredients.length > shown.length && (
        <Text variant="small">
          and {ingredients.length - shown.length} more in the form below.
        </Text>
      )}
      {warnings.length > 0 && (
        <DraftNote>
          <ul className="flex flex-col gap-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </DraftNote>
      )}
    </section>
  );
}
