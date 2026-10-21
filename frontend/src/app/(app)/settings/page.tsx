import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings/SettingsView";
import { ServerError } from "@/components/ServerError";
import { ApiError, type Capabilities, type User } from "@/lib/api";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const api = await serverApi();
  let me: User;
  let users: User[] = [];
  try {
    me = await api.me();
    if (me.role === "admin") users = await api.listUsers();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    return <ServerError error={e} />;
  }
  // The status line is a nicety: if it can't load, the rest of the page still works.
  const capabilities: Capabilities | null = await api.importCapabilities().catch(() => null);

  return <SettingsView me={me} users={users} capabilities={capabilities} />;
}
