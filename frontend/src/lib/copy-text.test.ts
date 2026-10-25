import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

const setClipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { value, configurable: true });
const setExec = (fn: unknown) => Object.defineProperty(document, "execCommand", { value: fn, configurable: true });

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  delete (document as unknown as Record<string, unknown>).execCommand;
});

describe("copyText", () => {
  it("uses the clipboard API where the page has it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    expect(await copyText("milk")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("milk");
  });

  it("selects a hidden textarea and runs the copy command when there is no clipboard API (plain http)", async () => {
    let selected = "";
    setExec(
      vi.fn(() => {
        const box = document.activeElement as HTMLTextAreaElement;
        selected = box.value.slice(box.selectionStart, box.selectionEnd);
        return true;
      }),
    );
    expect(await copyText("a\nb")).toBe(true);
    expect(selected).toBe("a\nb");
    expect(document.querySelector("textarea")).toBeNull(); // cleaned up
  });

  it("falls back to the copy command when the clipboard API refuses", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const exec = vi.fn(() => true);
    setExec(exec);
    expect(await copyText("milk")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("says no when the copy command says no, throws, or isn't there", async () => {
    setExec(vi.fn(() => false));
    expect(await copyText("x")).toBe(false);
    setExec(
      vi.fn(() => {
        throw new Error("nope");
      }),
    );
    expect(await copyText("x")).toBe(false);
    delete (document as unknown as Record<string, unknown>).execCommand;
    expect(await copyText("x")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("gives focus back to where it was", async () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    setExec(vi.fn(() => true));
    await copyText("x");
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
