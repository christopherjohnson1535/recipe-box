"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Fieldset } from "@/components/ui/Fieldset";
import { Input } from "@/components/ui/Input";
import { PhotoField } from "@/components/ui/PhotoField";
import { Textarea } from "@/components/ui/Textarea";
import { api as browserApi, ApiError, type Api, type RecipeInput } from "@/lib/api";
import { ListField } from "./ListField";
import { TagsField } from "./TagsField";
import { clearStash, loadStash, saveStash } from "./draft-stash";
import { addTags, fromItems, newRow, toItems, type Row } from "./list-model";

/** What the form starts from: a saved recipe, an import draft (with warnings) or nothing. */
export type RecipeFormInitial = RecipeInput & { imageUrl?: string | null; warnings?: string[] };

export type RecipeFormProps = {
  initial?: RecipeFormInitial;
  submitLabel: string;
  /** Saves the recipe and navigates away. Throw an ApiError to show it on the form. */
  onSubmit: (input: RecipeInput) => Promise<void>;
  cancelHref: string;
  /** Names the unsaved-draft stash: the recipe id, or "new". `null` keeps no stash (import review: a reload loses the draft anyway). */
  draftKey?: string | null;
  /** Treat the starting values as unsaved, so leaving warns even before any edit (an import draft nobody has seen yet). */
  startDirty?: boolean;
  api?: Pick<Api, "uploadMedia" | "listTags">;
};

type State = {
  title: string;
  description: string;
  servings: string;
  prep: string;
  cook: string;
  total: string;
  sourceUrl: string;
  sourceName: string;
  notes: string;
  tags: string[];
  tagDraft: string;
  ingredients: Row[];
  steps: Row[];
  imageId: string | null;
  imageUrl: string | null;
};

const withBlank = (rows: Row[]) => (rows.length > 0 ? rows : [newRow()]);

function initialState(i: RecipeFormInitial = { title: "" }): State {
  return {
    title: i.title,
    description: i.description ?? "",
    servings: i.servings ?? "",
    prep: i.prepMinutes?.toString() ?? "",
    cook: i.cookMinutes?.toString() ?? "",
    total: i.totalMinutes?.toString() ?? "",
    sourceUrl: i.sourceUrl ?? "",
    sourceName: i.sourceName ?? "",
    notes: i.notes ?? "",
    tags: i.tags ?? [],
    tagDraft: "",
    ingredients: withBlank(fromItems(i.ingredients ?? [])),
    steps: withBlank(fromItems(i.steps ?? [])),
    imageId: i.imageId ?? null,
    imageUrl: i.imageUrl ?? null,
  };
}

const MAX_MINUTES = 10000;
/** Empty, or a whole number of minutes from 0 to MAX_MINUTES (no decimals, which would be silently rounded). */
const validMinutes = (s: string) => s.trim() === "" || (/^\d+$/.test(s.trim()) && Number(s) <= MAX_MINUTES);
const minutes = (s: string) => (s.trim() === "" ? null : Math.round(Number(s)));

/** PUT replaces everything, so what the form doesn't edit (source type, import photos) is carried over. */
function buildInput(s: State, initial?: RecipeFormInitial): RecipeInput {
  return {
    title: s.title.trim(),
    description: s.description.trim(),
    ingredients: toItems(s.ingredients),
    steps: toItems(s.steps),
    servings: s.servings.trim() || null,
    prepMinutes: minutes(s.prep),
    cookMinutes: minutes(s.cook),
    totalMinutes: minutes(s.total),
    notes: s.notes.trim(),
    sourceUrl: s.sourceUrl.trim() || null,
    sourceName: s.sourceName.trim() || null,
    sourceType: initial?.sourceType ?? "manual",
    imageId: s.imageId,
    photoImageIds: initial?.photoImageIds ?? [],
    tags: addTags(s.tags, s.tagDraft),
  };
}

// Fields the API names in its validation message ("prepMinutes: must be 0 or more.") -> the control that shows it.
const FIELD_KEYS: Record<string, string> = {
  title: "title",
  prepMinutes: "prep",
  cookMinutes: "cook",
  totalMinutes: "total",
  sourceUrl: "sourceUrl",
};

function explain(error: unknown): { field?: string; message: string } {
  if (!(error instanceof ApiError)) return { message: "Something went wrong saving the recipe. Try again." };
  const m = error.code === "validation" ? error.message.match(/^(\w+): (.+)$/) : null;
  return m && FIELD_KEYS[m[1]] ? { field: FIELD_KEYS[m[1]], message: m[2] } : { message: error.message };
}

/** The recipe editor used for new recipes, edits and import review. */
export function RecipeForm({ initial, submitLabel, onSubmit, cancelHref, draftKey = "new", startDirty, api = browserApi }: RecipeFormProps) {
  const router = useRouter();
  const [state, setState] = useState(() => initialState(initial));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const saved = useRef(false);
  const [stashed, setStashed] = useState<State | null>(null);
  const [baseline] = useState(() => (startDirty ? "" : JSON.stringify(buildInput(state, initial))));

  const set = <K extends keyof State>(key: K, value: State[K]) => setState((s) => ({ ...s, [key]: value }));
  const dirty = JSON.stringify(buildInput(state, initial)) !== baseline;

  useEffect(() => {
    let live = true;
    api
      .listTags()
      .then((tags) => live && setSuggestions(tags.map((t) => t.name)))
      .catch(() => {}); // suggestions are a nicety
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (saved.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Offer back a draft left behind by an earlier visit (navigation on the iPad never shows the beforeunload prompt).
  useEffect(() => {
    const old = draftKey === null ? null : loadStash<State>(draftKey);
    if (old && JSON.stringify(buildInput(old, initial)) !== baseline) setStashed(old);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);

  // While dirty, keep the form value in the stash (debounced).
  useEffect(() => {
    if (!dirty || stashed || draftKey === null) return;
    const t = setTimeout(() => {
      if (!saved.current) saveStash(draftKey, state);
    }, 400);
    return () => clearTimeout(t);
  }, [dirty, state, stashed, draftKey]);

  function restore() {
    if (!stashed) return;
    // fresh row keys so they cannot clash with rows made since
    const again = (rows: Row[]) => rows.map((r) => newRow(r.text, r.heading));
    setState({ ...stashed, ingredients: withBlank(again(stashed.ingredients)), steps: withBlank(again(stashed.steps)) });
    setStashed(null);
  }

  function discardStash() {
    if (draftKey !== null) clearStash(draftKey);
    setStashed(null);
  }

  // After a failed save, move focus to the first field with an error, else to the message at the top.
  useEffect(() => {
    if (focusTick === 0) return;
    const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (bad ?? alertRef.current)?.focus();
  }, [focusTick]);

  function fail(next: Record<string, string>, general: string | null = null) {
    setErrors(next);
    setFormError(general);
    setFocusTick((t) => t + 1);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || uploading) return;
    const input = buildInput(state, initial);
    const problems: Record<string, string> = {};
    if (!input.title) problems.title = "Give the recipe a title.";
    for (const key of ["prep", "cook", "total"] as const) {
      if (!validMinutes(state[key])) problems[key] = `Whole minutes, 0 to ${MAX_MINUTES.toLocaleString("en")}.`;
    }
    if (Object.keys(problems).length > 0) return fail(problems);
    setErrors({});
    setFormError(null);
    setSaving(true);
    saved.current = true;
    try {
      await onSubmit(input);
      if (draftKey !== null) clearStash(draftKey);
    } catch (err) {
      saved.current = false;
      setSaving(false);
      const { field, message } = explain(err);
      if (field) fail({ [field]: message });
      else fail({}, message);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setErrors((prev) => ({ ...prev, photo: "" }));
    try {
      const image = await api.uploadMedia(file);
      setState((s) => ({ ...s, imageId: image.id, imageUrl: image.url }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, photo: err instanceof ApiError ? err.message : "The photo could not be uploaded." }));
    } finally {
      setUploading(false);
    }
  }

  function cancel() {
    if (dirty && !window.confirm("Discard your changes?")) return;
    saved.current = true; // stop the debounced stash writing it back
    if (draftKey !== null) clearStash(draftKey);
    router.push(cancelHref);
  }

  const bad = (key: string) => (errors[key] ? true : undefined);
  const described = (id: string, key: string) => (errors[key] ? `${id}-msg` : undefined);

  return (
    <form ref={formRef} method="post" noValidate onSubmit={submit} className="flex max-w-measure flex-col gap-10">
      {initial?.warnings && initial.warnings.length > 0 && (
        <Alert title="Check these before saving">
          <ul className="flex flex-col gap-1">
            {initial.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      {stashed && (
        <Alert title="You have unsaved changes from earlier">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={restore}>
              Restore
            </Button>
            <Button variant="ghost" onClick={discardStash}>
              Discard
            </Button>
          </div>
        </Alert>
      )}
      <div ref={alertRef} tabIndex={-1}>
        {formError && (
          <Alert tone="error" title="The recipe was not saved">
            {formError}
          </Alert>
        )}
      </div>

      <Fieldset legend="The basics">
        <Field label="Title" htmlFor="rf-title" error={errors.title}>
          <Input
            id="rf-title"
            name="title"
            required
            autoComplete="off"
            maxLength={300}
            aria-invalid={bad("title")}
            aria-describedby={described("rf-title", "title")}
            value={state.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="rf-description" hint="A line or two about the dish. Shown under the title.">
          <Textarea
            id="rf-description"
            name="description"
            aria-describedby="rf-description-msg"
            value={state.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Servings" htmlFor="rf-servings">
            <Input
              id="rf-servings"
              name="servings"
              autoComplete="off"
              placeholder="4…"
              value={state.servings}
              onChange={(e) => set("servings", e.target.value)}
            />
          </Field>
          {(
            [
              ["prep", "Prep (min)", "rf-prep"],
              ["cook", "Cook (min)", "rf-cook"],
              ["total", "Total (min)", "rf-total"],
            ] as const
          ).map(([key, label, id]) => (
            <Field key={key} label={label} htmlFor={id} error={errors[key]}>
              <Input
                id={id}
                name={key}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MINUTES}
                step={1}
                aria-invalid={bad(key)}
                aria-describedby={described(id, key)}
                value={state[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <TagsField
          tags={state.tags}
          onChange={(tags) => set("tags", tags)}
          draft={state.tagDraft}
          onDraft={(d) => set("tagDraft", d)}
          suggestions={suggestions}
        />
      </Fieldset>

      <Fieldset legend="Photo">
        <PhotoField
          id="rf-photo"
          label="Recipe photo"
          src={state.imageUrl}
          busy={uploading}
          error={errors.photo}
          onFile={upload}
          onRemove={() => setState((s) => ({ ...s, imageId: null, imageUrl: null }))}
        />
      </Fieldset>

      <ListField
        idPrefix="ing"
        legend="Ingredients"
        hint="One per line. Paste a whole list and it is split into lines. Start a section for headings like “For the sauce”."
        itemLabel="Ingredient"
        addLabel="Add ingredient"
        placeholder="200 g plain flour…"
        rows={state.ingredients}
        onChange={(rows) => set("ingredients", rows)}
      />

      <ListField
        idPrefix="step"
        legend="Method"
        hint="One step per entry. Paste numbered steps and they are split and renumbered."
        itemLabel="Step"
        addLabel="Add step"
        placeholder="Whisk the flour and milk until smooth…"
        rows={state.steps}
        onChange={(rows) => set("steps", rows)}
        multiline
      />

      <Fieldset legend="Source and notes">
        <Field label="Source link" htmlFor="rf-source-url" error={errors.sourceUrl}>
          <Input
            id="rf-source-url"
            name="sourceUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…"
            aria-invalid={bad("sourceUrl")}
            aria-describedby={described("rf-source-url", "sourceUrl")}
            value={state.sourceUrl}
            onChange={(e) => set("sourceUrl", e.target.value)}
          />
        </Field>
        <Field label="Source name" htmlFor="rf-source-name" hint="A cookbook, a website or a person.">
          <Input
            id="rf-source-name"
            name="sourceName"
            autoComplete="off"
            aria-describedby="rf-source-name-msg"
            value={state.sourceName}
            onChange={(e) => set("sourceName", e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="rf-notes" hint="Your own tips and changes.">
          <Textarea
            id="rf-notes"
            name="notes"
            aria-describedby="rf-notes-msg"
            value={state.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </Fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" pending={saving} disabled={uploading}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
