import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return <AccountScreen section="settings" />;
}
