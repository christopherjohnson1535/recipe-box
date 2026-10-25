import type { Metadata } from "next";
import { ShareView } from "./ShareView";

export const metadata: Metadata = { title: "Save from Safari" };

export default function SharePage() {
  return <ShareView />;
}
