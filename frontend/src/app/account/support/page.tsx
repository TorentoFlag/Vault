import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Поддержка" };

export default function SupportPage() {
  return <AccountScreen section="support" />;
}
