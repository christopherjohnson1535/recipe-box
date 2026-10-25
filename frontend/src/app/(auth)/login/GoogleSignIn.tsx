"use client";

import { HardLink } from "@/components/ui/Button";
import { OrDivider } from "@/components/ui/OrDivider";
import { Text } from "@/components/ui/Text";
import { googleSignInUrl } from "@/lib/api";
import { useInstalledApp } from "@/lib/installed-app";

/** The secondary way in, under the password form. A plain link: Google's page is a full navigation, not a popup. */
export function GoogleSignIn({ next }: { next: string }) {
  const installed = useInstalledApp();
  return (
    <div className="flex flex-col gap-4">
      <OrDivider />
      <HardLink href={googleSignInUrl(next)} variant="secondary" className="w-full" aria-describedby={installed ? "google-app-note" : undefined}>
        Sign in with Google
      </HardLink>
      {installed && (
        <Text variant="small" id="google-app-note">
          In the Home Screen app, if Google sends you back here, sign in with your password.
        </Text>
      )}
    </div>
  );
}
