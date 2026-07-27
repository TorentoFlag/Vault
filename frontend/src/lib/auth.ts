export type AuthMethod = "steam" | "email";

export type MarketplaceUser = {
  id: string;
  method: AuthMethod;
  displayName: string;
  email?: string;
  steamId?: string;
  steamConnected: boolean;
};

export type MarketplaceSession = {
  emailAccount: MarketplaceUser | null;
  steamAccount: MarketplaceUser | null;
};

export type AuthSearchValue = string | string[] | undefined;
export type AuthReturnPath =
  | "/cart"
  | "/checkout"
  | "/balance/top-up"
  | "/account"
  | "/account/purchases"
  | "/account/payments"
  | "/account/inventory"
  | "/account/steam"
  | "/account/settings"
  | "/account/support"
  | "/account/steam?returnTo=%2Fcheckout"
  | "/account/steam?returnTo=%2Fcart"
  | `/balance/top-up?${string}`;
export const MOCK_EMAIL_CODE = "482913";

export function validateEmail(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Укажите email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return "Введите email в формате name@example.com.";
  }
  return "";
}

export function validateMockCode(value: string) {
  if (!value.trim()) return "Введите код из письма.";
  if (!/^\d{6}$/.test(value.trim())) return "Код должен содержать 6 цифр.";
  if (value.trim() !== MOCK_EMAIL_CODE) return "Неверный код. Проверьте письмо и повторите попытку.";
  return "";
}

export function createMockSteamUser(): MarketplaceUser {
  return {
    id: "steam:7656119982144821",
    method: "steam",
    displayName: "Vault Player",
    steamId: "7656119982144821",
    steamConnected: true,
  };
}

export function createMockEmailUser(email: string): MarketplaceUser {
  const normalizedEmail = email.trim().toLocaleLowerCase("ru-RU");
  const localName = normalizedEmail.split("@")[0] || "Покупатель";

  return {
    id: `email:${normalizedEmail}`,
    method: "email",
    displayName: localName,
    email: normalizedEmail,
    steamConnected: false,
  };
}

export function isMarketplaceUser(value: unknown): value is MarketplaceUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<MarketplaceUser>;
  if (
    typeof user.id !== "string" ||
    typeof user.displayName !== "string" ||
    typeof user.steamConnected !== "boolean" ||
    (user.method !== "steam" && user.method !== "email")
  ) {
    return false;
  }

  if (user.method === "steam") {
    return user.steamConnected
      && typeof user.steamId === "string"
      && user.steamId.length > 0
      && user.id === `steam:${user.steamId}`
      && user.email === undefined;
  }

  if (user.steamId !== undefined || user.steamConnected || typeof user.email !== "string" || validateEmail(user.email)) return false;
  const normalizedEmail = user.email.trim().toLocaleLowerCase("ru-RU");
  return user.email === normalizedEmail && user.id === `email:${normalizedEmail}`;
}

export function connectAuthAccount(
  session: MarketplaceSession | null,
  account: MarketplaceUser,
): MarketplaceSession {
  const current = session ?? { emailAccount: null, steamAccount: null };
  return account.method === "steam"
    ? { ...current, steamAccount: account }
    : { ...current, emailAccount: account };
}

export function isMarketplaceSession(value: unknown): value is MarketplaceSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<MarketplaceSession>;
  const validEmail = session.emailAccount === null || isMarketplaceUser(session.emailAccount);
  const validSteam = session.steamAccount === null || isMarketplaceUser(session.steamAccount);

  return (
    validEmail &&
    validSteam &&
    (session.emailAccount !== null || session.steamAccount !== null) &&
    (session.emailAccount === null || session.emailAccount?.method === "email") &&
    (session.steamAccount === null || session.steamAccount?.method === "steam")
  );
}

const AUTH_RETURN_PATHS: AuthReturnPath[] = [
  "/cart",
  "/checkout",
  "/balance/top-up",
  "/account",
  "/account/purchases",
  "/account/payments",
  "/account/inventory",
  "/account/steam",
  "/account/settings",
  "/account/support",
];

export function createAccountAuthReturnPath(pathname: string, nestedReturnTo: string | null) {
  const accountPath = AUTH_RETURN_PATHS.includes(pathname as AuthReturnPath) && pathname.startsWith("/account")
    ? pathname
    : "/account";
  return accountPath === "/account/steam" && (nestedReturnTo === "/checkout" || nestedReturnTo === "/cart")
    ? `/account/steam?returnTo=${encodeURIComponent(nestedReturnTo)}` as AuthReturnPath
    : accountPath;
}

export function sanitizeAuthReturnPath(value: AuthSearchValue): AuthReturnPath | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (AUTH_RETURN_PATHS.includes(normalized as AuthReturnPath)) return normalized as AuthReturnPath;
  if (normalized?.startsWith("/account/steam?")) {
    try {
      const accountUrl = new URL(normalized, "https://vault.local");
      if (
        accountUrl.origin === "https://vault.local"
        && accountUrl.pathname === "/account/steam"
        && (accountUrl.searchParams.get("returnTo") === "/checkout" || accountUrl.searchParams.get("returnTo") === "/cart")
      ) return `/account/steam?returnTo=${encodeURIComponent(accountUrl.searchParams.get("returnTo")!)}` as AuthReturnPath;
    } catch { return null; }
  }
  if (!normalized?.startsWith("/balance/top-up?")) return null;
  let url: URL;
  try { url = new URL(normalized, "https://vault.local"); } catch { return null; }
  if (url.origin !== "https://vault.local" || url.pathname !== "/balance/top-up") return null;
  const safe = new URLSearchParams();
  if (url.searchParams.get("returnTo") === "/cart") safe.set("returnTo", "/cart");
  const requiredCoins = url.searchParams.get("requiredCoins");
  if (requiredCoins && /^\d+$/.test(requiredCoins) && Number(requiredCoins) > 0 && Number(requiredCoins) <= 100_000) {
    safe.set("requiredCoins", requiredCoins);
  }
  const query = safe.toString();
  return (query ? `/balance/top-up?${query}` : "/balance/top-up") as AuthReturnPath;
}
