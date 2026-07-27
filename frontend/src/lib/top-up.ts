export const TOP_UP_MIN_COINS = 100;
export const TOP_UP_MAX_COINS = 100_000;
export const TOP_UP_DEFAULT_COINS = 1500;

export type TopUpSearchValue = string | string[] | undefined;

export function validateTopUpAmount(value: string) {
  if (!value.trim()) return "Укажите сумму пополнения.";
  if (!/^\d+$/.test(value.trim())) return "Введите целое количество Coins.";

  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) return "Введите целое количество Coins.";
  if (amount < TOP_UP_MIN_COINS) return `Минимальная сумма — ${TOP_UP_MIN_COINS} Coins.`;
  if (amount > TOP_UP_MAX_COINS) {
    return `Максимальная сумма — ${TOP_UP_MAX_COINS.toLocaleString("ru-RU")} Coins.`;
  }

  return "";
}

export function getTopUpQuote(coinsAmount: number, rate: number, currentBalance: number) {
  const coins = Number.isFinite(coinsAmount) ? Math.max(0, Math.floor(coinsAmount)) : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const safeBalance = Number.isFinite(currentBalance) ? Math.max(0, Math.floor(currentBalance)) : 0;
  const rubles = safeRate ? Math.round((coins / safeRate) * 100) / 100 : 0;

  return {
    rubles,
    coins,
    balanceAfter: safeBalance + coins,
  };
}

export function getSuggestedTopUpCoins(requiredCoins: number) {
  if (!Number.isFinite(requiredCoins) || requiredCoins <= 0) return TOP_UP_DEFAULT_COINS;
  return Math.min(TOP_UP_MAX_COINS, Math.max(TOP_UP_MIN_COINS, Math.ceil(requiredCoins)));
}

export function normalizeTopUpQueryValue(value: TopUpSearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTopUpCoins(value: TopUpSearchValue) {
  const normalized = normalizeTopUpQueryValue(value);
  if (!normalized || !/^\d+$/.test(normalized)) return 0;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

export function sanitizeTopUpReturnPath(value: TopUpSearchValue): "/cart" | null {
  return normalizeTopUpQueryValue(value) === "/cart" ? "/cart" : null;
}

export function createTopUpAuthReturnPath(returnTo: "/cart" | null, requiredCoins: number) {
  if (returnTo !== "/cart") return "/balance/top-up";
  const safeCoins = getSuggestedTopUpCoins(requiredCoins);
  return `/balance/top-up?returnTo=${encodeURIComponent("/cart")}&requiredCoins=${safeCoins}`;
}
