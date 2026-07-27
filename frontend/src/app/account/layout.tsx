import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AccountShell } from "@/features/account/AccountShell";

export const metadata: Metadata = {
  title: { default: "Личный кабинет — Vault", template: "%s — Vault" },
  description: "Покупки, операции Coins, Steam и настройки аккаунта Vault.",
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main id="main-content" aria-busy="true" aria-live="polite" className="account-loading"><span>Загрузка личного кабинета…</span></main>}>
      <AccountShell>{children}</AccountShell>
    </Suspense>
  );
}
