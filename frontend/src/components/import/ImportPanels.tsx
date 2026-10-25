import type { FormEvent } from "react";
import { OfflineNote } from "@/components/offline/OfflineNote";
import { useOnline } from "@/components/offline/use-online";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";

export const MAX_PHOTOS = 6;
export type PhotoKind = "recipe" | "dish";

type Common = { busy: boolean; onSubmit: () => void };
const submitting = (onSubmit: () => void) => (e: FormEvent) => {
  e.preventDefault();
  if (navigator.onLine) onSubmit();
};
const OFFLINE_ID = "import-offline";
const OFFLINE_NOTE = "You’re offline. Importing reads the recipe on the server, so it waits until you’re back online.";

/** Every import goes through the server, so the submit button is off while offline, with the reason beside it. */
function ImportButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: string }) {
  const online = useOnline();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="submit" pending={busy} disabled={disabled || !online} aria-describedby={online ? undefined : OFFLINE_ID}>
        {children}
      </Button>
      <OfflineNote id={OFFLINE_ID}>{OFFLINE_NOTE}</OfflineNote>
    </div>
  );
}

export function LinkPanel({ url, onUrl, error, busy, onSubmit, aiOff }: Common & { url: string; onUrl: (v: string) => void; error?: string; aiOff: boolean }) {
  return (
    <form method="post" noValidate onSubmit={submitting(onSubmit)} className="flex max-w-measure flex-col gap-5">
      <Field
        label="Recipe link"
        htmlFor="import-url"
        error={error}
        hint={aiOff ? "Most recipe sites publish their recipe in a form we can read without AI." : "The page is read for you; you check the result before anything is saved."}
      >
        <Input
          id="import-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://example.com/best-pancakes"
          aria-invalid={error ? true : undefined}
          aria-describedby="import-url-msg"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
        />
      </Field>
      <ImportButton busy={busy}>Import recipe</ImportButton>
    </form>
  );
}

export function TextPanel({
  text,
  onText,
  source,
  onSource,
  error,
  sourceError,
  busy,
  onSubmit,
  aiOff,
  autoFocus,
}: Common & { text: string; onText: (v: string) => void; source: string; onSource: (v: string) => void; error?: string; sourceError?: string; aiOff: boolean; autoFocus: boolean }) {
  return (
    <form method="post" noValidate onSubmit={submitting(onSubmit)} className="flex max-w-measure flex-col gap-5">
      {aiOff && (
        <Text variant="small">
          Reading pasted text needs AI, and AI is off here, so this cannot be done yet. You can type the recipe in yourself.
        </Text>
      )}
      <Field label="Recipe text" htmlFor="import-text" error={error} hint="Copy the recipe from a page, a message or an email and paste it here.">
        <Textarea
          id="import-text"
          name="text"
          rows={10}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby="import-text-msg"
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      </Field>
      <Field label="Where it came from (optional)" htmlFor="import-source" error={sourceError} hint="A link, kept with the recipe as its source.">
        <Input
          id="import-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://…"
          aria-invalid={sourceError ? true : undefined}
          aria-describedby="import-source-msg"
          value={source}
          onChange={(e) => onSource(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <ImportButton busy={busy} disabled={aiOff}>
          Read the text
        </ImportButton>
        {aiOff && (
          <ButtonLink href="/recipes/new" variant="secondary">
            Type it in instead
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function PhotoPanel({
  files,
  onAdd,
  onRemove,
  kind,
  onKind,
  error,
  busy,
  onSubmit,
  aiOff,
}: Common & {
  files: File[];
  onAdd: (f: File[]) => void;
  onRemove: (i: number) => void;
  kind: PhotoKind;
  onKind: (k: PhotoKind) => void;
  error?: string;
  aiOff: boolean;
}) {
  return (
    <form method="post" noValidate onSubmit={submitting(onSubmit)} className="flex max-w-measure flex-col gap-5">
      {aiOff && (
        <Text variant="small">
          AI is off, so the photos cannot be read automatically. They are kept and shown beside an empty recipe so you can type it in.
        </Text>
      )}
      <PhotoPicker id="import-photos" label="Photos" files={files} max={MAX_PHOTOS} onAdd={onAdd} onRemove={onRemove} disabled={busy} error={error} />
      {!aiOff && (
        <ChoiceGroup
          legend="What is in the photos"
          name="photo-kind"
          value={kind}
          onChange={onKind}
          disabled={busy}
          options={[
            { value: "recipe", label: "A recipe", hint: "A cookbook page, handwritten card or screenshot. Several photos become one recipe." },
            { value: "dish", label: "A finished dish", hint: "We guess the recipe from how it looks, and say so." },
          ]}
        />
      )}
      <ImportButton busy={busy}>{aiOff ? "Keep photos and type it in" : "Read the photos"}</ImportButton>
    </form>
  );
}
