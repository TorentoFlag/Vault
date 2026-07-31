import type { Product } from "../types/commerce.ts";

export const STEAM_REFILL_MIN_RUB = 50;
export const STEAM_REFILL_MAX_RUB = 9_433;
export const STEAM_REFILL_DEFAULT_RUB = 1000;
export const STEAM_REFILL_PRESET_RUB = [500, 1000, 2000, 5000] as const;

export function validateSteamRefillRubAmount(value: string) {
  if (!value.trim()) return "Укажите сумму пополнения.";
  if (!/^\d+$/.test(value.trim())) return "Введите целую сумму в RUB.";

  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) return "Введите целую сумму в RUB.";
  if (amount < STEAM_REFILL_MIN_RUB) return `Минимальная сумма — ${STEAM_REFILL_MIN_RUB} RUB.`;
  if (amount > STEAM_REFILL_MAX_RUB) {
    return `Максимальная сумма — ${STEAM_REFILL_MAX_RUB.toLocaleString("ru-RU")} RUB.`;
  }

  return "";
}

export function getSteamRefillQuote(rubAmount: number, rate: number) {
  const rubles = Number.isFinite(rubAmount) ? Math.max(0, Math.floor(rubAmount)) : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const coins = Math.round(rubles * safeRate * 100) / 100;

  return {
    rubles,
    coins,
  };
}

export function createSteamRefillCartItem(rubAmount: number) {
  const amount = Number.isFinite(rubAmount) ? Math.floor(rubAmount) : 0;
  return {
    id: `steam-top-up-${amount}`,
    slug: `steam-top-up-${amount}-rub`,
    title: `Пополнение Steam на ${amount} RUB`,
  };
}

export function createSteamRefillProduct(rubAmount: number, rate: number): Product {
  const item = createSteamRefillCartItem(rubAmount);
  const quote = getSteamRefillQuote(rubAmount, rate);
  const nominal = `${quote.rubles} RUB`;

  return {
    ...item,
    kind: "steam",
    category: "Steam",
    game: "Steam",
    productType: "Пополнение баланса",
    description: `Пополнение аккаунта Steam на ${nominal}. Стоимость рассчитывается в Coins по курсу Vault.`,
    priceCoins: quote.coins,
    availability: "available",
    fulfillmentMode: "automatic",
    createdAt: "2026-07-01T10:00:00.000Z",
    popularity: 90,
    meta: ["Steam", "RUB"],
    keywords: ["стим", "кошелек", "баланс", "пополнение"],
    details: {
      specifications: [
        { label: "Сервис", value: "Steam" },
        { label: "Тип", value: "Пополнение баланса" },
        { label: "Зачисление в Steam", value: nominal },
      ],
      fulfillment: {
        title: "Данные пополнения Steam",
        description: "Логин Steam фиксируется в заказе. Зачисление выполняется через SIH после списания Coins.",
        requirements: [
          "Проверьте логин Steam перед оформлением.",
          "Стоимость фиксируется в Coins по курсу Vault.",
          "Сумма пополнения должна быть в пределах SIH для RUB.",
        ],
      },
    },
  };
}
