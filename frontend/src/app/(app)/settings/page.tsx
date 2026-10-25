import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";
import { ServerError } from "@/components/ServerError";
import { ApiError, type Capabilities, type GoogleStatus, type Settings, type User } from "@/lib/api";
import { redirectToLogin } from "@/lib/login-redirect";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google: googleResult } = await searchParams;
  const api = await serverApi();
  let me: User;
  let users: User[] = [];
  try {
    me = await api.me();
    if (me.role === "admin") users = await api.listUsers();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await redirectToLogin();
    return <ServerError error={e} />;
  }
  // The status line is a nicety: if it can't load, the rest of the page still works.
  const capabilities: Capabilities | null = await api.importCapabilities().catch(() => null);

  const settings: Settings | null = me.role === "admin" ? await api.getSettings().catch(() => null) : null;

  const google: GoogleStatus | null = await api.googleStatus().catch(() => null);

  return <SettingsView me={me} users={users} capabilities={capabilities} settings={settings} google={google} googleResult={googleResult} />;
}
