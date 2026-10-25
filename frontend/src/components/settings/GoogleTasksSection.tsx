"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LocalDate } from "@/components/recipe-page/LocalDate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { HardLink } from "@/components/ui/GroceryKit";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { api as browserApi, ApiError, GOOGLE_CONNECT_URL, type Api, type GoogleStatus } from "@/lib/api";

const DEPLOY = "https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#google-tasks-optional";

type Notice = { tone: "info" | "error"; text: string };

/** What Google's redirect back to /settings says happened (`?google=`), in words. */
const RESULTS: Record<string, Notice> = {
  connected: { tone: "info", text: "Google Tasks connected." },
  error: { tone: "error", text: "Couldn’t connect Google Tasks. Try again." },
};

type Props = {
  /** The member's connection as the server saw it on load; null when it couldn't be asked. */
  initial: GoogleStatus | null;
  /** The `?google=` value the page was opened with. Announced once, then taken out of the address. */
  result?: string;
  api?: Pick<Api, "disconnectGoogle">;
};

/** Each member's own link to Google Tasks, for sending the grocery list there. Connecting is a trip to Google and back. */
export function GoogleTasksSection({ initial, result, api = browserApi }: Props) {
  const [status, setStatus] = useState(initial);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const found = result ? RESULTS[result] : undefined;
    if (!found) return;
    queueMicrotask(() => setNotice(found)); // after the live region is on the page, so it is read out
    router.replace("/settings"); // a reload must not announce it again
  }, [result, router]);

  async function disconnect() {
    setPending(true);
    try {
      await api.disconnectGoogle();
      setStatus((s) => s && { ...s, connected: false, connectedAt: null });
      setNotice({ tone: "info", text: "Google Tasks disconnected." });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Couldn’t disconnect Google Tasks. Try again." });
    } finally {
      setPending(false);
      setConfirming(false);
      heading.current?.focus();
    }
  }

  return (
    <section aria-labelledby="google-heading" className="flex flex-col gap-4">
      <Heading level={2} id="google-heading" ruled ref={heading} tabIndex={-1}>
        Google Tasks
      </Heading>
      <Text>Send your grocery list to a list called Groceries in your own Google Tasks, to shop from Google’s apps. Each person connects their own Google account.</Text>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {status === null ? (
        <Text variant="note">Couldn’t check Google Tasks. Reload the page to try again.</Text>
      ) : !status.configured ? (
        <Text variant="small">
          Google Tasks is off for this household. The household admin can turn it on: the steps are in the Google Tasks part of the <ExternalLink href={DEPLOY}>deploy guide</ExternalLink>.
        </Text>
      ) : status.connected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Text>
              <Text as="span" variant="strong">
                Connected
              </Text>
              {status.connectedAt && <LocalDate iso={status.connectedAt} />}
            </Text>
            <Button variant="ghost" aria-expanded={confirming} disabled={confirming} onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          </div>
          {confirming && (
            <ConfirmInline confirmLabel="Disconnect" cancelLabel="Stay connected" pending={pending} onConfirm={() => void disconnect()} onCancel={() => setConfirming(false)}>
              Disconnect Google Tasks? Recipe Box forgets your connection and asks Google to end its access. Tasks already in your Google list stay where they are.
            </ConfirmInline>
          )}
          <Text variant="small">While the household’s Google app is in Testing mode, Google ends the connection after 7 days. Connect again when the grocery list asks you to.</Text>
        </>
      ) : (
        <>
          <div className="flex">
            <HardLink href={GOOGLE_CONNECT_URL} variant="secondary">
              Connect Google Tasks
            </HardLink>
          </div>
          <Text variant="small">This takes you to Google’s consent page, then back here.</Text>
        </>
      )}
    </section>
  );
}
