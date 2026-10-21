"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipe-form/RecipeForm";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Pending } from "@/components/ui/Pending";
import { PhotoGallery } from "@/components/ui/PhotoPicker";
import { Tabs } from "@/components/ui/Tabs";
import { Text } from "@/components/ui/Text";
import { ApiError, api as browserApi, type Api, type Capabilities, type RecipeDraft } from "@/lib/api";
import { LinkPanel, MAX_PHOTOS, PhotoPanel, TextPanel, type PhotoKind } from "./ImportPanels";
import { explainImportError, type ImportMode, type ImportProblem } from "./import-errors";

export type ImportApi = Pick<
  Api,
  "importCapabilities" | "importUrl" | "importText" | "importPhoto" | "createRecipe" | "uploadMedia" | "listTags"
>;

const TABS = [
  { id: "link", label: "Link" },
  { id: "photo", label: "Photo" },
  { id: "text", label: "Text" },
] as const;

const WAITING: Record<ImportMode, string> = {
  link: "Fetching the page and looking for the recipe…",
  photo: "Reading the photos can take about 20 seconds. Please keep this page open…",
  text: "Reading the text can take about 10 seconds…",
};

/** A bare "example.com/pancakes" is a fair thing to paste; the API wants a scheme. */
const withScheme = (s: string) => (/^[a-z][a-z\d+.-]*:\/\//i.test(s) || !/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) ? s : `https://${s}`);

type Review = {
  id: number;
  initial: RecipeFormInitial;
  duplicateOf: string | null;
  /** Server-stored original photos, shown beside the form. */
  photoIds: string[];
  /** AI was off: no draft, an empty form to type into. */
  byHand: boolean;
};

export function ImportScreen({ initialMode = "link", initialUrl = "", api = browserApi }: { initialMode?: ImportMode; initialUrl?: string; api?: ImportApi }) {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>(initialUrl ? "link" : initialMode);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<PhotoKind>("recipe");
  const [busy, setBusy] = useState<ImportMode | null>(null);
  const [problem, setProblem] = useState<{ from: ImportMode; value: ImportProblem } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [seenDuplicate, setSeenDuplicate] = useState(false);
  const [focusText, setFocusText] = useState(false);
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewCount = useRef(0);
  const autoStarted = useRef(false);

  useEffect(() => {
    let live = true;
    api
      .importCapabilities()
      .then((c) => live && setCaps(c))
      .catch(() => {}); // only used for hints; the calls report their own failures
    return () => {
      live = false;
    };
  }, [api]);

  // `?url=` (from the Shortcut or bookmarklet) starts the link import once.
  useEffect(() => {
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      void importLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);

  // A draft has arrived: move to it. A field error: put the cursor back in the field.
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  useEffect(() => {
    if (problem?.value.field) document.getElementById(problem.from === "link" ? "import-url" : "import-text")?.focus();
  }, [problem]);

  const aiOff = caps?.ai === false;

  function pick(next: ImportMode) {
    setMode(next);
    setProblem(null);
    // keep the address bar in step without a navigation, so the mode survives a reload and can be shared
    window.history.replaceState(null, "", `/import?mode=${next}`);
  }

  async function start(from: ImportMode, call: () => Promise<RecipeDraft>) {
    const id = ++request.current;
    setProblem(null);
    setBusy(from);
    try {
      const draft = await call();
      if (id !== request.current) return;
      const { warnings, duplicateOf, ...rest } = draft;
      setSeenDuplicate(false);
      setReview({
        id: ++reviewCount.current,
        initial: { ...rest, warnings },
        duplicateOf,
        photoIds: draft.photoImageIds ?? [],
        byHand: false,
      });
    } catch (e) {
      if (id !== request.current) return;
      const value = explainImportError(e, from);
      if (from === "photo" && e instanceof ApiError && e.code === "ai_disabled" && value.photoIds.length > 0) {
        setReview({
          id: ++reviewCount.current,
          initial: { title: "", sourceType: "photo", photoImageIds: value.photoIds },
          duplicateOf: null,
          photoIds: value.photoIds,
          byHand: true,
        });
      } else {
        setProblem({ from, value });
      }
    } finally {
      if (id === request.current) setBusy(null);
    }
  }

  async function importLink(address = url) {
    const clean = withScheme(address.trim());
    if (!clean) return setProblem({ from: "link", value: { ...explainImportError(new ApiError(400, "validation", "Paste the address of a recipe page."), "link") } });
    setUrl(clean);
    await start("link", () => api.importUrl(clean));
  }

  async function importText() {
    if (!text.trim()) return setProblem({ from: "text", value: explainImportError(new ApiError(400, "validation", "Paste the recipe text first."), "text") });
    await start("text", () => api.importText(text.trim(), source.trim() || undefined));
  }

  async function importPhotos() {
    if (files.length === 0) return setProblem({ from: "photo", value: explainImportError(new ApiError(400, "validation", "Choose at least one photo."), "photo") });
    await start("photo", () => api.importPhoto(files, kind));
  }

  function stopWaiting() {
    request.current++; // the answer, when it comes, is ignored
    setBusy(null);
  }

  function pasteInstead() {
    if (!source) setSource(url.trim());
    setFocusText(true);
    pick("text");
  }

  function backToInput() {
    if (!window.confirm("Throw away this draft and go back?")) return;
    setReview(null);
  }

  async function save(input: Parameters<ImportApi["createRecipe"]>[0]) {
    const saved = await api.createRecipe(input);
    router.push(`/recipes/${saved.id}`);
  }

  if (review) {
    const photos = review.photoIds.map((id) => ({ src: `/media/${id}.jpg`, alt: `Original photo ${review.photoIds.indexOf(id) + 1}` }));
    const duplicate = review.duplicateOf && !seenDuplicate;
    const form = (
      <RecipeForm
        key={review.id}
        initial={review.initial}
        startDirty
        draftKey={null}
        submitLabel="Save recipe"
        onSubmit={save}
        cancelHref="/import"
        api={api}
      />
    );
    return (
      <div className="flex flex-col gap-8">
        <Heading level={2} ref={heading} tabIndex={-1} ruled>
          {review.byHand ? "Type it in" : "Check the recipe"}
        </Heading>
        {duplicate ? (
          <Alert title="You already have this recipe">
            <div className="flex flex-col gap-4">
              <Text variant="small">A recipe from this link is already in your box. Open it, or import it again as a separate recipe.</Text>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/recipes/${review.duplicateOf}`}>Open the existing recipe</ButtonLink>
                <Button variant="secondary" onClick={() => setSeenDuplicate(true)}>
                  Import anyway
                </Button>
                <Button variant="ghost" onClick={() => setReview(null)}>
                  Go back
                </Button>
              </div>
            </div>
          </Alert>
        ) : (
          <>
            {review.byHand ? (
              <Alert title="AI is switched off">Your photos are saved. Type the recipe in beside them; nothing is read automatically.</Alert>
            ) : (
              <Text variant="deck">Nothing is saved until you press Save. Fix anything that looks wrong first.</Text>
            )}
            {photos.length > 0 ? (
              <div className="grid items-start gap-10 lg:grid-cols-2">
                <div className="flex flex-col gap-3 lg:sticky lg:top-6">
                  <Heading level={3} size="label">
                    Original {photos.length === 1 ? "photo" : "photos"}
                  </Heading>
                  <PhotoGallery photos={photos} />
                </div>
                {form}
              </div>
            ) : (
              form
            )}
            <div>
              <Button variant="ghost" onClick={backToInput}>
                Start over with a different {mode === "link" ? "link" : mode === "photo" ? "photo" : "text"}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const here = problem && problem.from === mode ? problem.value : null;
  const fieldError = here?.field ? here.message : undefined;
  return (
    <div className="flex flex-col gap-8">
      <Tabs label="Import from" idPrefix="import" tabs={TABS} value={mode} onChange={pick} />
      <div role="tabpanel" id="import-panel" aria-labelledby={`import-tab-${mode}`} className="flex flex-col gap-6">
        {mode === "link" && <LinkPanel url={url} onUrl={setUrl} error={fieldError} busy={busy === "link"} onSubmit={() => importLink()} aiOff={aiOff} />}
        {mode === "text" && (
          <TextPanel
            text={text}
            onText={setText}
            source={source}
            onSource={setSource}
            error={fieldError}
            busy={busy === "text"}
            onSubmit={importText}
            aiOff={aiOff}
            autoFocus={focusText}
          />
        )}
        {mode === "photo" && (
          <PhotoPanel
            files={files}
            onAdd={(added) => setFiles((f) => [...f, ...added].slice(0, MAX_PHOTOS))}
            onRemove={(i) => setFiles((f) => f.filter((_, at) => at !== i))}
            kind={kind}
            onKind={setKind}
            error={fieldError}
            busy={busy === "photo"}
            onSubmit={importPhotos}
            aiOff={aiOff}
          />
        )}
        {busy === mode && (
          <Pending
            action={
              <Button variant="secondary" onClick={stopWaiting}>
                Stop waiting and edit
              </Button>
            }
          >
            {WAITING[mode]}
          </Pending>
        )}
        {here && !here.field && (
          <Alert tone={here.tone} title={here.title}>
            <div className="flex flex-col gap-4">
              <Text variant="small">{here.message}</Text>
              {here.offers.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {here.offers.includes("paste-text") && <Button onClick={pasteInstead}>Paste the recipe text instead</Button>}
                  {here.offers.includes("type-in") && (
                    <ButtonLink href="/recipes/new" variant="secondary">
                      Type it in
                    </ButtonLink>
                  )}
                </div>
              )}
            </div>
          </Alert>
        )}
      </div>
    </div>
  );
}
