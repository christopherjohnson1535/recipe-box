import { AccountSection } from "@/components/settings/AccountSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { AiImportSection } from "@/components/settings/AiImportSection";
import { ExportSection } from "@/components/settings/ExportSection";
import { GoogleTasksSection } from "@/components/settings/GoogleTasksSection";
import { HouseholdSection } from "@/components/settings/HouseholdSection";
import { PhotosSection } from "@/components/settings/PhotosSection";
import { SaveFromSafariSection } from "@/components/settings/SaveFromSafariSection";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Capabilities, GoogleStatus, Settings, User } from "@/lib/api";

/** The settings page body. Only admins get the Household section (the API refuses members anyway). */
export function SettingsView({
  me,
  users,
  capabilities,
  settings = null,
  google = null,
  googleResult,
}: {
  me: User;
  users: User[];
  capabilities: Capabilities | null;
  settings?: Settings | null;
  google?: GoogleStatus | null;
  googleResult?: string;
}) {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader kicker="Settings" title="Your household" description="Your account, the people who share this recipe box, how this device looks, Google Tasks, and whether AI import is on." />
      <AccountSection user={me} />
      {me.role === "admin" && <HouseholdSection currentUserId={me.id} initialUsers={users} />}
      {me.role === "admin" && settings && <PhotosSection initial={settings.plateTreatment} />}
      {me.role === "admin" && <ExportSection />}
      <GoogleTasksSection initial={google} result={googleResult} />
      <AppearanceSection />
      <SaveFromSafariSection />
      <AiImportSection capabilities={capabilities} />
    </div>
  );
}
