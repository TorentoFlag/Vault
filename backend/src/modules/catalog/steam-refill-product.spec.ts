import { describe, expect, it } from "vitest";

import {
  STEAM_REFILL_COIN_MINOR_PER_RUB,
  STEAM_REFILL_MAX_RUB,
  STEAM_REFILL_MIN_RUB,
  buildSteamRefillProduct,
  parseSteamRefillAmountRub,
} from "./steam-refill-product";

describe("steam refill catalog product", () => {
  it("builds a dynamic Steam refill product from a valid RUB slug", () => {
    const product = buildSteamRefillProduct("steam-top-up-9433-rub");
    const display = `${(STEAM_REFILL_MAX_RUB * STEAM_REFILL_COIN_MINOR_PER_RUB / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`;

    expect(product).toMatchObject({
      id: "steam-top-up-9433",
      slug: "steam-top-up-9433-rub",
      kind: "steam",
      category: "Steam",
      game: "Steam",
      title: "Пополнение Steam на 9433 RUB",
      price: {
        currency: "COINS",
        amountMinor: STEAM_REFILL_MAX_RUB * STEAM_REFILL_COIN_MINOR_PER_RUB,
        scale: 2,
        display,
      },
    });
  });

  it("accepts only whole SIH RUB amounts inside the provider bounds", () => {
    expect(parseSteamRefillAmountRub(`steam-top-up-${STEAM_REFILL_MIN_RUB}-rub`)).toBe(STEAM_REFILL_MIN_RUB);
    expect(parseSteamRefillAmountRub(`steam-top-up-${STEAM_REFILL_MAX_RUB}-rub`)).toBe(STEAM_REFILL_MAX_RUB);

    expect(parseSteamRefillAmountRub("steam-top-up-49-rub")).toBeNull();
    expect(parseSteamRefillAmountRub("steam-top-up-9434-rub")).toBeNull();
    expect(parseSteamRefillAmountRub("steam-top-up-100.5-rub")).toBeNull();
    expect(parseSteamRefillAmountRub("steam-top-up-rub")).toBeNull();
  });
});
