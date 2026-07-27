import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "История Coins" };

export default function PaymentsPage() {
  return <AccountScreen section="payments" />;
}
