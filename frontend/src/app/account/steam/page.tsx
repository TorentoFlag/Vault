import type { Metadata } from "next";

import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Steam" };
export const dynamic = "force-static";

type SteamPageProps = { searchParams: Promise<{ returnTo?: string | string[] }> };

export default async function SteamPage({ searchParams }: SteamPageProps) {
  const params = await searchParams;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  return <AccountScreen section="steam" returnTo={returnTo === "/checkout" ? "/checkout" : returnTo === "/cart" ? "/cart" : null} />;
}
