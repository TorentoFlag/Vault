import type { Metadata } from "next";

import { TopUpScreen } from "@/features/top-up/TopUpScreen";
import {
  getSuggestedTopUpCoins,
  parseTopUpCoins,
  sanitizeTopUpReturnPath,
  type TopUpSearchValue,
} from "@/lib/top-up";

export const metadata: Metadata = {
  title: "Пополнение баланса — Vault",
  description: "Калькулятор суммы Coins по фиксированному курсу Vault.",
};
export const dynamic = "force-static";

type TopUpPageProps = {
  searchParams: Promise<{ requiredCoins?: TopUpSearchValue; returnTo?: TopUpSearchValue }>;
};

export default async function TopUpPage({ searchParams }: TopUpPageProps) {
  const params = await searchParams;
  const suggestedCoins = getSuggestedTopUpCoins(parseTopUpCoins(params.requiredCoins));

  return (
    <TopUpScreen
      suggestedCoins={suggestedCoins}
      returnTo={sanitizeTopUpReturnPath(params.returnTo)}
    />
  );
}
