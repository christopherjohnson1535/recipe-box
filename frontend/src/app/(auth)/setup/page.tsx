import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ServerError } from "@/components/ServerError";
import { setupStatus } from "@/lib/setup-status";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const status = await setupStatus();
  if (!status.error && !status.needsSetup) redirect("/login");

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Set up your recipe box</h1>
        <p className="text-muted">
          Create the first account. It becomes the admin who can add the rest of your household.
        </p>
      </div>
      {status.error ? <ServerError error={status.error} /> : <SetupForm />}
    </Card>
  );
}
