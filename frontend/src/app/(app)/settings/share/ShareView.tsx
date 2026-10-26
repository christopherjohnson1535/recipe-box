"use client";

import { useSyncExternalStore } from "react";
import { TwoColumns } from "@/components/ui/Columns";
import { BookmarkTab } from "@/components/ui/BookmarkTab";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Disclosure } from "@/components/ui/Disclosure";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Step, Steps } from "@/components/ui/Steps";
import { TextLink } from "@/components/ui/TextLink";
import { Heading } from "@/components/ui/Heading";
import { Hint } from "@/components/ui/Hint";
import { PageHeader } from "@/components/ui/PageHeader";
import { Text } from "@/components/ui/Text";
import { bookmarkletFor, shortcutAddress } from "./bookmarklet";
import { CopyButton } from "./CopyButton";

const noop = () => () => {};
// This page's own address is the one the bookmark and the Shortcut must open. Blank on the server, filled on arrival.
const origin = () => window.location.origin;

export function ShareView() {
  const here = useSyncExternalStore(noop, origin, () => "");
  const bookmarklet = here ? bookmarkletFor(here) : "";
  const address = here ? shortcutAddress(here) : "";
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        kicker="Settings"
        title="Save from Safari"
        description="Found a recipe somewhere else? Send it here without copying and pasting the link."
      />

      {/* Two ways to do the same thing: side by side from 1280px. */}
      <TwoColumns
        left={
          <section aria-labelledby="share-ipad" className="flex flex-col gap-5">
            <Heading level={2} id="share-ipad" ruled>
              On an iPad or iPhone
            </Heading>
            <Text>
              iPadOS has no way for a web app to appear in the Share menu, so you make a small{" "}
              <Text as="span" variant="strong">
                Shortcut
              </Text>{" "}
              once. After that, Share → Save to Recipe Box works from Safari and from most apps.
            </Text>
            <Steps>
              <Step n={1}>
                <p>
                  Open the <b>Shortcuts</b> app, tap <b>+</b> for a new shortcut and name it <b>Save to Recipe Box</b>.
                </p>
              </Step>
              <Step n={2}>
                <p>
                  Tap the <b>i</b> (details) button, turn on <b>Show in Share Sheet</b>, and under Share Sheet Types keep only <b>URLs</b> and{" "}
                  <b>Safari web pages</b>.
                </p>
              </Step>
              <Step n={3}>
                <p>
                  Add the action <b>URL Encode</b> (search “encode”; set it to <b>Encode</b>) and give it <b>Shortcut Input</b>.
                </p>
              </Step>
              <Step n={4}>
                <p>
                  Add a <b>Text</b> action holding this address, then tap just after the <b>=</b> and insert the <b>URL Encoded Text</b>{" "}
                  variable:
                </p>
                <CodeBlock>{address || "https://your-address/import?url="}</CodeBlock>
                <CopyButton value={address} label="Copy the address" disabled={!address} />
              </Step>
              <Step n={5}>
                <p>
                  Add <b>Open URLs</b> and give it that Text. Done.
                </p>
              </Step>
              <Step n={6}>
                <p>
                  Try it: in Safari on a recipe page tap <b>Share</b> → <b>Save to Recipe Box</b>. Recipe Box opens in Safari and asks you to
                  confirm before it reads the page.
                </p>
              </Step>
            </Steps>
            <Hint>
              The shortcut opens Recipe Box in Safari, not in the Home Screen app, and signs in separately the first time. Full steps and fixes
              are on the{" "}
              <ExternalLink href="https://github.com/christopherjohnson1535/recipe-box/wiki/Save-from-Safari">Save from Safari</ExternalLink>{" "}
              wiki page.
            </Hint>
          </section>
        }
        right={
          <section aria-labelledby="share-desktop" className="flex flex-col gap-5">
            <Heading level={2} id="share-desktop" ruled>
              On a computer
            </Heading>
            <Text>
              Drag this tab onto your bookmarks bar (show it with <b>Ctrl</b>+<b>Shift</b>+<b>B</b>, or <b>⌘</b>+<b>Shift</b>+<b>B</b> on a
              Mac). On a recipe page, click the bookmark. Recipe Box opens in a new tab and asks you to confirm.
            </Text>
            {bookmarklet ? (
              <BookmarkTab href={bookmarklet}>Save to Recipe Box</BookmarkTab>
            ) : (
              <Text variant="note">Getting the bookmark ready…</Text>
            )}
            <Hint>The bookmark only sends the address of the page you are on. It does not read the page or take anything from it.</Hint>
            <Disclosure summary="Can’t drag it?">
              <Text>
                Copy the bookmark, add any bookmark in your browser, then edit it: name it <b>Save to Recipe Box</b> and paste this into the
                address (URL) box.
              </Text>
              <CodeBlock>{bookmarklet || "…"}</CodeBlock>
              <CopyButton value={bookmarklet} label="Copy the bookmark" disabled={!bookmarklet} />
            </Disclosure>
          </section>
        }
      />

      <p>
        <TextLink href="/settings">Back to settings</TextLink>
      </p>
    </div>
  );
}
