import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { AuthSection } from "@/components/ui/AuthSection";
import { googleSignInOn } from "@/lib/auth-providers";
import { firstParam, safeNext, type SearchParams } from "@/lib/nav";
import { setupStatus } from "@/lib/setup-status";
import { GoogleSignIn } from "./GoogleSignIn";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

/** What the API's redirect back from Google (`?error=`) says went wrong. */
const GOOGLE_ERRORS: Record<string, { title: string; text: string }> = {
  google_not_member: { title: "That Google account isn’t in this household", text: "Ask your household admin to add your Google email first." },
  google_failed: { title: "Google sign-in didn’t finish", text: "Try again, or sign in with your username and password." },
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ next, error }, status, google] = await Promise.all([searchParams, setupStatus(), googleSignInOn()]);
  if (status.needsSetup) redirect("/setup");
  const code = firstParam(error) ?? "";
  const googleError = Object.hasOwn(GOOGLE_ERRORS, code) ? GOOGLE_ERRORS[code] : undefined;
  const safe = safeNext(next);

  return (
    <AuthSection kicker="Account" title="Sign in" deck="Use the account your household admin made for you.">
      {status.error && (
        <Alert tone="error" title="Can’t reach the Recipe Box server">
          Signing in won’t work until it’s back. Wait a moment, then reload this page.
        </Alert>
      )}
      {googleError && (
        <Alert tone="error" title={googleError.title}>
          {googleError.text}
        </Alert>
      )}
      <LoginForm next={safe} />
      {google && <GoogleSignIn next={safe} />}
    </AuthSection>
  );
}
