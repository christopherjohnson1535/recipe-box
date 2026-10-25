"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { HardLink, SendArea } from "@/components/ui/GroceryKit";
import { Text } from "@/components/ui/Text";
import { api, ApiError, GOOGLE_CONNECT_URL, type GoogleStatus } from "@/lib/api";
import { groceryShareText, SHARE_TITLE } from "./share-text";
import type { GroceryList } from "./types";

type Message = { tone: "info" | "error"; text: ReactNode };

const RECONNECT = <HardLink href={GOOGLE_CONNECT_URL}>Reconnect Google Tasks</HardLink>;

/** What the person is told when a send to Google Tasks fails, by the API's error code. */
function sendError(e: unknown): Message {
  if (e instanceof ApiError && e.code === "google_not_connected")
    return { tone: "error", text: <>Google Tasks isn’t connected, or Google no longer accepts the connection. {RECONNECT}.</> };
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
  const [message, setMessage] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const canShare = typeof navigator.share === "function";
  const offline = online ? {} : { "aria-describedby": offlineId };

  async function share() {
    setMessage(null);
    try {
      await navigator.share({ title: SHARE_TITLE, text: groceryShareText(list, showStaples) });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return; // the person closed the share sheet
      setMessage({ tone: "error", text: "Couldn’t open the share sheet. Try again." });
    }
  }

  async function copy() {
    setMessage(null);
    try {
      await navigator.clipboard.writeText(groceryShareText(list, showStaples));
      setMessage({ tone: "info", text: "Copied." });
    } catch {
      setMessage({ tone: "error", text: "Couldn’t copy the list here. Your browser may need permission." });
    }
  }

  async function sendToGoogle() {
    if (sending) return;
    setMessage(null);
    setSending(true);
    try {
      const sent = await api.exportGroceryToGoogleTasks(showStaples);
      const where = `Google Tasks › ${sent.taskListTitle}`;
      setMessage({ tone: "info", text: sent.items === 0 ? `Nothing to send: ${where} is now empty.` : `Sent ${sent.items} ${sent.items === 1 ? "item" : "items"} to ${where}.` });
    } catch (e) {
      if (e instanceof ApiError && e.code === "google_not_connected") onNotConnected();
      setMessage(sendError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <SendArea
      label="Send to…"
      actions={
        <>
          {canShare ? <Button variant="secondary" onClick={() => void share()}>Share list</Button> : <Button variant="secondary" onClick={() => void copy()}>Copy list</Button>}
          {google?.configured &&
            (google.connected ? (
              <Button variant="secondary" pending={sending} disabled={!online} {...offline} onClick={() => void sendToGoogle()}>
                {sending ? "Sending…" : "Send to Google Tasks"}
              </Button>
            ) : online ? (
              <HardLink href={GOOGLE_CONNECT_URL} variant="secondary">
                Connect Google Tasks
              </HardLink>
            ) : (
              <Button variant="secondary" disabled {...offline}>
                Connect Google Tasks
              </Button>
            ))}
        </>
      }
    >
      {google?.configured && !google.connected && <Text variant="small">Connect Google Tasks takes you to Google’s consent page, then back to Settings.</Text>}
      <div role="status">{message?.tone === "info" && <Text variant="small">{message.text}</Text>}</div>
      {message?.tone === "error" && <Alert tone="error">{message.text}</Alert>}
    </SendArea>
  );
}
