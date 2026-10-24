import { ApiError } from "@/lib/api";

export type ImportMode = "link" | "photo" | "text";
/** A way forward the screen can offer as a button. */
export type Offer = "paste-text" | "type-in" | "retry" | "sign-in";

export type ImportProblem = {
  title: string;
  message: string;
  /** `info` for "coming soon", `error` for everything else. */
  tone: "error" | "info";
  offers: Offer[];
  /** Show the message under the input instead of in a note (a bad address, empty text). */
  field: boolean;
  /** The input the message belongs to, when `field` is set. */
  fieldId?: string;
  /** Photos the server stored before it refused (`ai_disabled`), for the by-hand form. */
  photoIds: string[];
};

const WHAT: Record<ImportMode, string> = { link: "links", photo: "photos", text: "pasted text" };

type Rule = Partial<Pick<ImportProblem, "tone" | "field" | "fieldId">> & Pick<ImportProblem, "title" | "message"> & { offers?: Offer[] };

function rule(code: string, mode: ImportMode, serverMessage: string): Rule | undefined {
  switch (code) {
    case "blocked_address":
      return {
        title: "That address can’t be imported",
        message: "Only public web pages can be read, never addresses inside your home network. Check the link and try again.",
      };
    case "site_blocked":
      return {
        title: "That site won’t let us read its page",
        message: "Some sites block anything that is not a browser. Copy the recipe from the page and paste it here instead.",
        offers: ["paste-text", "type-in"],
      };
    case "fetch_failed":
      return {
        title: "The page could not be loaded",
        message: "The site may be down, slow or refusing us. Try again in a moment, or paste the recipe text instead.",
        offers: ["paste-text"],
      };
    case "no_recipe_found":
      return {
        title: "No recipe found on that page",
        message: "The page does not publish its recipe in a form we can read. Paste the recipe text instead, or type it in.",
        offers: ["paste-text", "type-in"],
      };
    case "validation": {
      // The API prefixes the offending field ("sourceUrl: must be an http(s) URL."); show it under that input.
      const named = /^(\w+):\s*(.*)$/.exec(serverMessage);
      const name = named?.[1];
      const rest = named ? named[2] : serverMessage;
      const web = "Enter a full web address starting with https://";
      return {
        title: "Check what you entered",
        message: name === "url" || name === "sourceUrl" ? web : rest,
        field: mode !== "photo",
        fieldId: name === "sourceUrl" ? "import-source" : mode === "link" ? "import-url" : "import-text",
      };
    }
    case "too_large":
      return mode === "photo"
        ? { title: "A photo is too big", message: "Remove the largest photo or take it again at a lower quality, then try again." }
        : { title: "That text is too big", message: "Text over 1 MB can’t be imported. Paste just the recipe, without the rest of the page." };
    case "unsupported_media":
      return { title: "That kind of file can’t be read", message: "Use JPEG, PNG or WebP photos." };
    case "ai_disabled":
      return {
        title: "AI is switched off",
        message:
          mode === "text"
            ? "Reading pasted text needs AI, and none is set up. You can type the recipe in instead."
            : "Reading this needs AI, and none is set up. You can type the recipe in instead.",
        offers: ["type-in"],
      };
    case "not_implemented":
      return {
        title: "Coming soon",
        message: `Importing ${WHAT[mode]} is not ready yet. For now you can type the recipe in.`,
        tone: "info",
        offers: ["type-in"],
      };
    case "unauthenticated":
      return { title: "You have been signed out", message: "Sign in again, then come back to import.", offers: ["sign-in"] };
    case "network":
      return { title: "Can’t reach Recipe Box", message: serverMessage, offers: ["retry", "type-in"] };
    default:
      return undefined;
  }
}

/** Turns anything thrown by an import call into a title, a message and the next steps the screen can offer. */
export function explainImportError(error: unknown, mode: ImportMode): ImportProblem {
  const api = error instanceof ApiError ? error : null;
  const found = api && rule(api.code, mode, api.message);
  const r: Rule = found || {
    title: "The import failed",
    message: api?.message || "Something went wrong.",
    offers: ["retry", "type-in"],
  };
  const ids = api?.details.photoImageIds;
  return {
    title: r.title,
    message: r.message,
    tone: r.tone ?? "error",
    // "Paste text" only makes sense as a way out of a link import.
    offers: (r.offers ?? []).filter((o) => o !== "paste-text" || mode === "link"),
    field: r.field ?? false,
    fieldId: r.fieldId,
    photoIds: Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : [],
  };
}
