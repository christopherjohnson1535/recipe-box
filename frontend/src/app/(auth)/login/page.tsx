import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { safeNext, type SearchParams } from "@/lib/nav";
import { setupStatus } from "@/lib/setup-status";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ next }, status] = await Promise.all([searchParams, setupStatus()]);
  if (status.needsSetup) redirect("/setup");

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="text-muted">Use the account your household admin made for you.</p>
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
