import assert from "node:assert/strict";
import test from "node:test";

import {
  STEAM_REFILL_MAX_RUB,
  STEAM_REFILL_MIN_RUB,
  createSteamRefillCartItem,
  createSteamRefillProduct,
  getSteamRefillQuote,
  validateSteamRefillRubAmount,
} from "./steam-refill.ts";

test("Steam refill validation accepts only whole RUB amounts inside SIH limits", () => {
  assert.equal(validateSteamRefillRubAmount(""), "Укажите сумму пополнения.");
  assert.equal(validateSteamRefillRubAmount("49"), `Минимальная сумма — ${STEAM_REFILL_MIN_RUB} RUB.`);
  assert.equal(validateSteamRefillRubAmount("9434"), `Максимальная сумма — ${STEAM_REFILL_MAX_RUB.toLocaleString("ru-RU")} RUB.`);
  assert.equal(validateSteamRefillRubAmount("100.5"), "Введите целую сумму в RUB.");
  assert.equal(validateSteamRefillRubAmount("1000"), "");
});

test("Steam refill quote converts entered RUB to Coins by active site rate", () => {
  assert.deepEqual(getSteamRefillQuote(1000, 1.5), {
    rubles: 1000,
    coins: 1500,
  });
});

test("Steam refill cart item uses dynamic RUB slug", () => {
  assert.deepEqual(createSteamRefillCartItem(9433), {
    id: "steam-top-up-9433",
    slug: "steam-top-up-9433-rub",
    title: "Пополнение Steam на 9433 RUB",
  });
});

test("Steam refill product can be generated without adding static catalog cards", () => {
  const product = createSteamRefillProduct(500, 1.5);

  assert.equal(product.id, "steam-top-up-500");
  assert.equal(product.slug, "steam-top-up-500-rub");
  assert.equal(product.kind, "steam");
  assert.equal(product.priceCoins, 750);
  assert.equal(product.details.fulfillment.title, "Данные пополнения Steam");
});
