"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, HardLink } from "@/components/ui/Button";
import { ConfirmInline } from "@/components/ui/ConfirmInline";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Heading } from "@/components/ui/Heading";
import { MemberItem, MemberList } from "@/components/ui/MemberList";
import { Text } from "@/components/ui/Text";
import { api as browserApi, ApiError, GOOGLE_LINK_URL, type Api, type Identity } from "@/lib/api";
import { useInstalledApp } from "@/lib/installed-app";

const DEPLOY = "https://github.com/christopherjohnson1535/recipe-box/blob/main/docs/DEPLOY.md#sign-in-with-google-optional";

type Notice = { tone: "info" | "error"; text: string };

/** What the API's redirect back to /settings (`?signin=`) says happened, in words. */
const RESULTS: Record<string, Notice> = {
  linked: { tone: "info", text: "Google account connected. You can now sign in with it." },
  taken: { tone: "error", text: "That Google account is already connected to another member. Pick a different Google account." },
  error: { tone: "error", text: "Couldn’t connect your Google account. Try again." },
};

type Props = {
  /** The member's linked Google accounts as the server saw them on load; null when it couldn't be asked. */
  initial: Identity[] | null;
  /** Whether the server offers Sign in with Google at all. */
  available: boolean;
  /** The `?signin=` value the page was opened with. Announced once, then taken out of the address. */
  result?: string;
  api?: Pick<Api, "deleteIdentity">;
};

/** Each member's Google accounts that may sign in as them. Not the Google Tasks link below: that one only sends the grocery list. */
export function GoogleSignInSection({ initial, available, result, api = browserApi }: Props) {
  const [identities, setIdentities] = useState(initial);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const hint = useId();
  const installed = useInstalledApp();

  useEffect(() => {
    if (!result) return;
    const found = Object.hasOwn(RESULTS, result) ? RESULTS[result] : undefined;
    if (found) queueMicrotask(() => setNotice(found));
    window.history.replaceState(null, "", "/settings"); // a reload must not announce it again; Next keeps its router in step
  }, [result]);

  async function disconnect(identity: Identity) {
    setPending(true);
    try {
      await api.deleteIdentity(identity.id);
      setIdentities((list) => list && list.filter((i) => i.id !== identity.id));
      setNotice({ tone: "info", text: `${identity.email} was disconnected.` });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : `Couldn’t disconnect ${identity.email}. Try again.` });
    } finally {
      setPending(false);
      setConfirming(null);
      heading.current?.focus();
    }
  }

  function cancel(identity: Identity) {
    setConfirming(null);
    requestAnimationFrame(() => buttons.current.get(identity.id)?.focus()); // the panel that had focus is gone
  }

  return (
    <section aria-labelledby="signin-heading" className="flex flex-col gap-4">
      <Heading level={2} id="signin-heading" ruled ref={heading} tabIndex={-1}>
        Sign in with Google
      </Heading>
      <Text>Use a Google account instead of typing your password. Your username and password keep working.</Text>
      <div role="status">{notice?.tone === "info" && <Alert tone="info">{notice.text}</Alert>}</div>
      {notice?.tone === "error" && <Alert tone="error">{notice.text}</Alert>}
      {identities === null ? (
        <Text variant="note">Couldn’t check your connected Google accounts. Reload the page to try again.</Text>
      ) : (
        <>
          {identities.length > 0 && (
            <MemberList label="Connected Google accounts">
              {identities.map((i) => (
                <MemberItem
                  key={i.id}
                  name={i.email}
                  detail="Google account"
                  actions={
                    <Button
                      variant="ghost"
                      ref={(el) => {
                        if (el) buttons.current.set(i.id, el);
                        else buttons.current.delete(i.id);
                      }}
                      aria-label={`Disconnect ${i.email}`}
                      aria-expanded={confirming === i.id}
                      disabled={confirming === i.id}
                      onClick={() => setConfirming(i.id)}
                    >
                      Disconnect
                    </Button>
                  }
                  panel={
                    confirming === i.id ? (
                      <ConfirmInline
                        confirmLabel="Disconnect"
                        cancelLabel="Stay connected"
                        pending={pending}
                        onConfirm={() => void disconnect(i)}
                        onCancel={() => cancel(i)}
                      >
                        Disconnect {i.email}? You can still sign in with your username and password.
                      </ConfirmInline>
                    ) : undefined
                  }
                />
              ))}
            </MemberList>
          )}
          {available ? (
            <>
              <div className="flex">
                <HardLink href={GOOGLE_LINK_URL} variant="secondary" aria-describedby={hint}>
                  Connect Google
                </HardLink>
              </div>
              <Text variant="small" id={hint}>
                {installed
                  ? "Connect from Safari (or your browser), not the Home Screen app: open Settings there."
                  : identities.length > 0
                    ? "Connect another account. This takes you to Google, then back here."
                    : "This takes you to Google, then back here. The account doesn’t need to match your household email."}
              </Text>
            </>
          ) : (
            <Text variant="small">
              Sign in with Google is off for this household. The household admin can turn it on: the steps are in the <ExternalLink href={DEPLOY}>deploy guide</ExternalLink>.
            </Text>
          )}
        </>
      )}
    </section>
  );
}
