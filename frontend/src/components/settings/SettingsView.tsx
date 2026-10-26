import { AccountSection } from "@/components/settings/AccountSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { AiImportSection } from "@/components/settings/AiImportSection";
import { ExportSection } from "@/components/settings/ExportSection";
import { GoogleSignInSection } from "@/components/settings/GoogleSignInSection";
import { GoogleTasksSection } from "@/components/settings/GoogleTasksSection";
import { HouseholdSection } from "@/components/settings/HouseholdSection";
import { PhotosSection } from "@/components/settings/PhotosSection";
import { SaveFromSafariSection } from "@/components/settings/SaveFromSafariSection";
import { TwoColumns } from "@/components/ui/Columns";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AuthProviders, Capabilities, GoogleStatus, Identity, Settings, User } from "@/lib/api";

/** The settings page body. Only admins get the Household section (the API refuses members anyway). */
export function SettingsView({
  me,
  users,
  capabilities,
  settings = null,
  google = null,
  googleResult,
  identities = null,
  providers = null,
  signinResult,
}: {
  me: User;
  users: User[];
  capabilities: Capabilities | null;
  settings?: Settings | null;
  google?: GoogleStatus | null;
  googleResult?: string;
  /** The member's linked Google accounts; null when they couldn't be loaded. */
  identities?: Identity[] | null;
  providers?: AuthProviders | null;
  signinResult?: string;
}) {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader kicker="Settings" title="Your household" description="Your account, the people who share this recipe box, how this device looks, signing in with Google, Google Tasks, and whether AI import is on." />
      {/* From 1280px: you and your household on the left, this device and the app's tools on the right. */}
      <TwoColumns
        left={
          <>
            <AccountSection user={me} />
            <GoogleSignInSection initial={identities} available={providers === null ? null : providers.google} result={signinResult} />
            {me.role === "admin" && <HouseholdSection currentUserId={me.id} initialUsers={users} />}
          </>
        }
        right={
          <>
            {me.role === "admin" && settings && <PhotosSection initial={settings.plateTreatment} />}
            {me.role === "admin" && <ExportSection />}
            <GoogleTasksSection initial={google} result={googleResult} />
            <AppearanceSection />
            <SaveFromSafariSection />
            <AiImportSection capabilities={capabilities} />
          </>
        }
      />
    </div>
  );
}
