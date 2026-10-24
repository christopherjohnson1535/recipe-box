import { AccountSection } from "@/components/settings/AccountSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { AiImportSection } from "@/components/settings/AiImportSection";
import { HouseholdSection } from "@/components/settings/HouseholdSection";
import { PhotosSection } from "@/components/settings/PhotosSection";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Capabilities, Settings, User } from "@/lib/api";

/** The settings page body. Only admins get the Household section (the API refuses members anyway). */
export function SettingsView({ me, users, capabilities, settings = null }: { me: User; users: User[]; capabilities: Capabilities | null; settings?: Settings | null }) {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader kicker="Settings" title="Your household" description="Your account, the people who share this recipe box, how this device looks, and whether AI import is on." />
      <AccountSection user={me} />
      {me.role === "admin" && <HouseholdSection currentUserId={me.id} initialUsers={users} />}
      {me.role === "admin" && settings && <PhotosSection initial={settings.plateTreatment} />}
      <AppearanceSection />
      <AiImportSection capabilities={capabilities} />
    </div>
  );
}
