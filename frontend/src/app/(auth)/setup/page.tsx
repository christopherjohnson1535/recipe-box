import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { ServerError } from "@/components/ServerError";
import { setupStatus } from "@/lib/setup-status";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const status = await setupStatus();
  if (!status.error && !status.needsSetup) redirect("/login");

  return (
    <Card className="flex flex-col gap-7 px-5 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col gap-2">
        <Heading level={1}>Set up your recipe box</Heading>
        <Text variant="deck">
          Create the first account. It becomes the admin who can add the rest of your household.
        </Text>
      </div>
      {status.error ? <ServerError error={status.error} /> : <SetupForm />}
    </Card>
  );
}
