import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Инвентарь" };

export default function InventoryPage() {
  return <AccountScreen section="inventory" />;
}
