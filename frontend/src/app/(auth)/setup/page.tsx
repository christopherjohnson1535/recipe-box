import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSection } from "@/components/ui/AuthSection";
import { ServerError } from "@/components/ServerError";
import { setupStatus } from "@/lib/setup-status";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const status = await setupStatus();
  if (!status.error && !status.needsSetup) redirect("/login");

  return (
    <AuthSection
      kicker="First account"
      title="Set up your recipe box"
      deck="Create the first account. It becomes the admin who can add the rest of your household."
    >
      {status.error ? <ServerError error={status.error} /> : <SetupForm />}
    </AuthSection>
  );
}
