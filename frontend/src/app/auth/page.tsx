import type { Metadata } from "next";

import { AuthScreen } from "@/features/auth/AuthScreen";
import { sanitizeAuthReturnPath, type AuthMethod, type AuthSearchValue } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Вход — Vault",
  description: "Вход в Vault через Steam или Email.",
};
export const dynamic = "force-static";

type AuthPageProps = {
  searchParams: Promise<{
    method?: AuthSearchValue;
    required?: AuthSearchValue;
    returnTo?: AuthSearchValue;
  }>;
};

function first(value: AuthSearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const method: AuthMethod = first(params.method) === "email" ? "email" : "steam";
  const steamRequired = first(params.required) === "steam";

  return (
    <AuthScreen
      initialMethod={steamRequired ? "steam" : method}
      returnTo={sanitizeAuthReturnPath(params.returnTo)}
      steamRequired={steamRequired}
    />
  );
}
