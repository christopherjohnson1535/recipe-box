"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, HardLink } from "@/components/ui/Button";
import { SendArea } from "@/components/ui/GroceryKit";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";
import { api, ApiError, GOOGLE_CONNECT_URL, type GoogleStatus } from "@/lib/api";
import { copyText } from "@/lib/copy-text";
import { CONNECT_IN_BROWSER, useInstalledApp } from "@/lib/installed-app";
import { groceryShareText, SHARE_TITLE } from "./share-text";
import type { GroceryList } from "./types";

type Message = {
  tone: "info" | "error";
  text: ReactNode;
  /** The list's text, set out to select by hand when nothing on this device would copy it. */
  manual?: string;
  /** Send focus to the Reconnect link: the Send button it replaces had it. */
  focusReconnect?: boolean;
};

/** What the person is told when a send to Google Tasks fails, by the API's error code. */
function sendError(e: unknown, reconnect: Ref<HTMLAnchorElement>): Message {
  if (e instanceof ApiError && e.code === "google_not_connected")
    return {
      tone: "error",
      focusReconnect: true,
      text: (
        <>
          Google Tasks isn’t connected, or Google no longer accepts the connection.{" "}
          <HardLink ref={reconnect} href={GOOGLE_CONNECT_URL}>
            Reconnect Google Tasks
          </HardLink>
          .
        </>
      ),
    };
  if (e instanceof ApiError && e.code === "google_disabled") return { tone: "error", text: "Google Tasks isn’t turned on for this household. Ask the household admin." };
  return { tone: "error", text: e instanceof ApiError ? e.message : "Couldn’t send the list to Google Tasks. Try again." };
}

/**
 * "Send to…" under the list (GRO-5): Share (the device's share sheet, so iPad and iPhone can hand the list to Keep, Reminders
 * or Messages) or Copy where there isn't one, and, when the server has Google set up, Send to Google Tasks.
 */
export function SendList({
  list,
  showStaples,
  online,
  offlineId,
  google,
  onNotConnected,
}: {
  list: GroceryList;
  showStaples: boolean;
  online: boolean;
  /** Id of the page's offline note, which says why a button that needs the network is off. */
  offlineId: string;
  google: GoogleStatus | null;
  /** The server says the Google connection is gone: the page's status should read "not connected". */
  onNotConnected: () => void;
}) {
  const [said, setSaid] = useState<(Message & { stamp: string }) | null>(null);
  const [sending, setSending] = useState(false);
  const installed = useInstalledApp();
  const hint = useId();
  const reconnect = useRef<HTMLAnchorElement>(null);
  const manual = useRef<HTMLTextAreaElement>(null);
  const canShare = typeof navigator.share === "function";
  const offline = online ? {} : { "aria-describedby": offlineId };
  // What was said is about the list as it was: a tick, an added item or the staples toggle makes it stale, so it goes.
  const stamp = `${list.updatedAt}|${showStaples}`;
  const message = said?.stamp === stamp ? said : null;
  const say = (m: Message | null) => setSaid(m && { ...m, stamp });

  useEffect(() => {
    if (message?.focusReconnect) reconnect.current?.focus();
    if (message?.manual) {
      manual.current?.focus();
      manual.current?.select();
    }
  }, [message]);

  async function copy(done: string) {
    const text = groceryShareText(list, showStaples);
    if (await copyText(text)) say({ tone: "info", text: done });
    else say({ tone: "info", text: "Select and copy the list below.", manual: text });
  }

  async function share() {
    say(null);
    try {
      await navigator.share({ title: SHARE_TITLE, text: groceryShareText(list, showStaples) }); // first, before any await: it needs the tap
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === "AbortError" || name === "InvalidStateError") return; // the person closed the sheet, or tapped again while it was open
      await copy("Couldn’t open the share sheet, so the list was copied.");
    }
  }

  async function sendToGoogle() {
    if (sending) return;
    say(null);
    setSending(true);
    try {
      const sent = await api.exportGroceryToGoogleTasks(showStaples);
      const where = `Google Tasks › ${sent.taskListTitle}`;
      say({ tone: "info", text: sent.items === 0 ? `Nothing to send: ${where} is now empty.` : `Sent ${sent.items} ${sent.items === 1 ? "item" : "items"} to ${where}.` });
    } catch (e) {
      if (e instanceof ApiError && e.code === "google_not_connected") onNotConnected();
      say(sendError(e, reconnect));
    } finally {
      setSending(false);
    }
  }

  const connectHint = installed ? CONNECT_IN_BROWSER : "Connect Google Tasks takes you to Google’s consent page, then back to Settings.";
  const leftOut = !showStaples && list.items.some((i) => i.staple && !i.checked);

  return (
    <SendArea
      label="Send to…"
      actions={
        <>
          {canShare ? (
            <Button variant="secondary" onClick={() => void share()}>
              Share list
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void copy("Copied.")}>
              Copy list
            </Button>
          )}
          {google?.configured &&
            (google.connected ? (
              <Button variant="secondary" aria-disabled={sending || undefined} aria-busy={sending || undefined} disabled={!online} {...offline} onClick={() => void sendToGoogle()}>
                {sending ? "Sending…" : "Send to Google Tasks"}
              </Button>
            ) : online ? (
              <HardLink href={GOOGLE_CONNECT_URL} variant="secondary" aria-describedby={hint}>
                Connect Google Tasks
              </HardLink>
            ) : (
              <Button variant="secondary" disabled aria-describedby={`${hint} ${offlineId}`}>
                Connect Google Tasks
              </Button>
            ))}
        </>
      }
    >
      {leftOut && <Text variant="small">Staples are left out. Turn on Show staples to include them.</Text>}
      {google?.configured && !google.connected && (
        <Text variant="small" id={hint}>
          {connectHint}
        </Text>
      )}
      <div role="status">{sending ? <Text variant="small">Sending to Google Tasks…</Text> : message?.tone === "info" && <Text variant="small">{message.text}</Text>}</div>
      {message?.manual && <Textarea ref={manual} readOnly aria-label="The list, to copy" rows={Math.min(message.manual.split("\n").length, 10)} value={message.manual} />}
      {message?.tone === "error" && <Alert tone="error">{message.text}</Alert>}
    </SendArea>
  );
}
