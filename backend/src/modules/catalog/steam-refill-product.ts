import type { CatalogProductDto, CoinPriceDto } from "./catalog.types";

export const STEAM_REFILL_MIN_RUB = 50;
export const STEAM_REFILL_MAX_RUB = 9_433;
export const STEAM_REFILL_COIN_MINOR_PER_RUB = 150;

const steamRefillSlugPattern = /^steam-top-up-([1-9][0-9]*)-rub$/;
const coinRateLabel = "1 RUB = 1.5 Coins";

function priceDto(amountMinor: number): CoinPriceDto {
  return {
    currency: "COINS",
    amountMinor,
    scale: 2,
    display: amountMinor % 100 === 0
      ? `${(amountMinor / 100).toLocaleString("ru-RU")} Coins`
      : `${(amountMinor / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`,
  };
}

export function parseSteamRefillAmountRub(slug: string): number | null {
  const match = steamRefillSlugPattern.exec(slug);
  if (match === null || match[1] === undefined) return null;
  const amountRub = Number(match[1]);
  if (!Number.isSafeInteger(amountRub)) return null;
  if (amountRub < STEAM_REFILL_MIN_RUB || amountRub > STEAM_REFILL_MAX_RUB) return null;
  return amountRub;
}

export function buildSteamRefillProduct(slug: string): CatalogProductDto | null {
  const amountRub = parseSteamRefillAmountRub(slug);
  if (amountRub === null) return null;
  const priceCoinMinor = amountRub * STEAM_REFILL_COIN_MINOR_PER_RUB;
  const nominal = `${amountRub} RUB`;

  return {
    id: `steam-top-up-${amountRub}`,
    slug,
    kind: "steam",
    category: "Steam",
    game: "Steam",
    productType: "Пополнение баланса",
    title: `Пополнение Steam на ${nominal}`,
    description: `Пополнение аккаунта Steam на ${nominal}. Стоимость рассчитывается в Coins по курсу Vault.`,
    availability: "available",
    fulfillmentMode: "automatic",
    createdAt: "2026-07-01T10:00:00.000Z",
    popularity: 90,
    meta: [coinRateLabel, "Steam", "RUB"],
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
    price: priceDto(priceCoinMinor),
  };
}
