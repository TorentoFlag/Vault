import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Мои покупки" };

export default function PurchasesPage() {
  return <AccountScreen section="purchases" />;
}
