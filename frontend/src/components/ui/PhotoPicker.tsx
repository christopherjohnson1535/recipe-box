"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "./Button";
import { Label } from "./Field";
import { IconButton } from "./IconButton";

const thumb = "aspect-[3/2] h-auto w-full object-cover [filter:var(--photo-filter)]";

/** Preview of a picked file. The object URL is made and released with the thumbnail (set on the element, not in state). */
function Thumb({ file, alt }: { file: File; alt: string }) {
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (img.current) img.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={img} alt={alt} width={300} height={200} className={thumb} />;
}

type PhotoPickerProps = {
  id: string;
  label: string;
  files: readonly File[];
  max: number;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  error?: string;
};

/**
 * Several photos at once, with previews and a remove cross each. `accept="image/*"` without `capture` makes iPadOS
 * offer both the camera and the library.
 */
export function PhotoPicker({ id, label, files, max, onAdd, onRemove, disabled, error }: PhotoPickerProps) {
  const full = files.length >= max;
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>{label}</Label>
      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative flex flex-col gap-1">
              <Thumb file={f} alt={`Photo ${i + 1}: ${f.name}`} />
              <div className="absolute top-1 right-1 bg-(--panel-bg)">
                <IconButton icon="remove" label={`Remove photo ${i + 1}`} onClick={() => onRemove(i)} disabled={disabled} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={buttonClass(
            "secondary",
            "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring) has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
          )}
        >
          {files.length === 0 ? "Take or choose photos" : "Add more photos"}
          <input
            id={id}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || full}
            aria-describedby={`${id}-msg`}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = ""; // choosing the same file again must still fire
              if (picked.length > 0) onAdd(picked);
            }}
            className="sr-only"
          />
        </label>
      </div>
      <p id={`${id}-msg`} className={error ? "text-small text-danger" : "text-small text-ink-muted italic"} role={error ? "alert" : undefined}>
        {error ?? (full ? `That is the most photos at once (${max}).` : `Up to ${max} photos, for example the pages of one recipe.`)}
      </p>
    </div>
  );
}

/** Photos already stored on the server, shown full width with a link to open each at full size. */
export function PhotoGallery({ photos, strip }: { photos: readonly { src: string; alt: string }[]; strip?: boolean }) {
  // `strip`: below `lg` a compact horizontal row of thumbnails, so a long gallery does not push the form down.
  return (
    <ul className={strip ? "flex flex-row gap-3 overflow-x-auto pb-2 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0" : "flex flex-col gap-4"}>
      {photos.map((p) => (
        <li key={p.src} className={strip ? "shrink-0 lg:shrink" : undefined}>
          <a href={p.src} target="_blank" rel="noreferrer" className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">
            <img src={p.src} alt={p.alt} width={600} height={800} className={strip ? "h-28 w-auto max-w-none lg:h-auto lg:w-full [filter:var(--photo-filter)]" : "h-auto w-full [filter:var(--photo-filter)]"} />
            <span className="sr-only"> (opens full size in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
