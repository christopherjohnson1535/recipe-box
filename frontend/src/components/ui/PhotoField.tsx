import { Button } from "./Button";
import { Label } from "./Field";

type PhotoFieldProps = {
  id: string;
  label: string;
  /** URL of the current photo, if any. */
  src?: string | null;
  busy?: boolean;
  error?: string;
  onFile: (file: File) => void;
  onRemove: () => void;
};

/** Photo picker with a preview. Choosing another file replaces the photo. */
export function PhotoField({ id, label, src, busy, error, onFile, onRemove }: PhotoFieldProps) {
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>{label}</Label>
      {src && (
        <img
          src={src}
          alt="Preview of the recipe photo"
          width={600}
          height={400}
          className="aspect-[3/2] h-auto w-full max-w-measure object-cover [filter:var(--photo-filter)]"
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="file"
          accept="image/*"
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // choosing the same file again must still fire
            if (file) onFile(file);
          }}
          className="min-h-control min-w-0 max-w-full text-small text-ink file:mr-4 file:min-h-control file:cursor-pointer file:rounded-control file:border file:border-(--button-secondary-border) file:bg-transparent file:px-5 file:text-label file:font-semibold file:tracking-[0.12em] file:text-(--button-secondary-fg) file:uppercase hover:file:border-(--button-secondary-hover) hover:file:text-(--button-secondary-hover) disabled:cursor-not-allowed disabled:opacity-55"
        />
        {src && (
          <Button variant="ghost" onClick={onRemove} disabled={busy}>
            Remove photo
          </Button>
        )}
      </div>
      <p role="status" className="text-small text-ink-muted italic empty:hidden">
        {busy ? "Uploading…" : null}
      </p>
      {error && (
        <p id={`${id}-msg`} role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
