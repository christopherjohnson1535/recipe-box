import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Placeholder
      title="Settings"
      coming="Your account, household members, AI import status and export"
      issues="ACC"
    />
  );
}
