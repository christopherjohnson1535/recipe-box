/** Hidden-textarea copy for pages with no `navigator.clipboard` (plain http on a LAN address); it works on iOS Safari too. */
function copyWithSelection(text: string): boolean {
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement("textarea");
  box.value = text;
  box.readOnly = true;
  box.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px"; // 16px: iOS zooms into smaller fields it focuses
  document.body.append(box);
  try {
    box.focus({ preventScroll: true });
    box.select();
    box.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
    before?.focus?.();
  }
}

/**
 * Puts `text` on the clipboard: the async API where the page may use it, else a selection and `execCommand`. Call it from
 * a click handler; with no clipboard API it runs before any await, so the browser still sees the tap. False when neither works.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission refused: try the selection route
    }
  }
  return copyWithSelection(text);
}
