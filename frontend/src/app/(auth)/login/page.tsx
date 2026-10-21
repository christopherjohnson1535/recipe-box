import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { safeNext, type SearchParams } from "@/lib/nav";
import { setupStatus } from "@/lib/setup-status";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ next }, status] = await Promise.all([searchParams, setupStatus()]);
  if (status.needsSetup) redirect("/setup");

  return (
    <Card className="flex flex-col gap-7 px-5 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col gap-2">
        <Heading level={1}>Sign in</Heading>
        <Text variant="deck">Use the account your household admin made for you.</Text>
      </div>
      {status.error && (
        <Alert tone="error" title="Can’t reach the Recipe Box server">
          Signing in won’t work until it’s back. Wait a moment, then reload this page.
        </Alert>
      )}
      <LoginForm next={safeNext(next)} />
    </Card>
  );
}
