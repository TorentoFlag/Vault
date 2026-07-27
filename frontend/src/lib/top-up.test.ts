import assert from "node:assert/strict";
import test from "node:test";

import {
  TOP_UP_MAX_COINS,
  TOP_UP_MIN_COINS,
  getSuggestedTopUpCoins,
  createTopUpAuthReturnPath,
  getTopUpQuote,
  normalizeTopUpQueryValue,
  sanitizeTopUpReturnPath,
  validateTopUpAmount,
} from "./top-up.ts";

test("вход из калькулятора сохраняет корзину и требуемую сумму", () => {
  assert.equal(
    createTopUpAuthReturnPath("/cart", 2840),
    "/balance/top-up?returnTo=%2Fcart&requiredCoins=2840",
  );
  assert.equal(createTopUpAuthReturnPath(null, 2840), "/balance/top-up");
});

test("сумма пополнения ограничена целым количеством Coins в допустимом диапазоне", () => {
  assert.equal(validateTopUpAmount(""), "Укажите сумму пополнения.");
  assert.equal(validateTopUpAmount("99"), `Минимальная сумма — ${TOP_UP_MIN_COINS} Coins.`);
  assert.equal(validateTopUpAmount("100001"), `Максимальная сумма — ${TOP_UP_MAX_COINS.toLocaleString("ru-RU")} Coins.`);
  assert.equal(validateTopUpAmount("100.5"), "Введите целое количество Coins.");
  assert.equal(validateTopUpAmount("1000"), "");
});

test("котировка использует централизованный курс и целое количество Coins", () => {
  assert.deepEqual(getTopUpQuote(1500, 1.5, 250), {
    rubles: 1000,
    coins: 1500,
    balanceAfter: 1750,
  });
});

test("дефицит корзины становится безопасной подсказкой суммы Coins", () => {
  assert.equal(getSuggestedTopUpCoins(2840), 2840);
  assert.equal(getSuggestedTopUpCoins(0), 1500);
  assert.equal(getSuggestedTopUpCoins(9999999), TOP_UP_MAX_COINS);
});

test("query принимает первое строковое значение и только allowlisted возврат", () => {
  assert.equal(normalizeTopUpQueryValue(["2840", "5000"]), "2840");
  assert.equal(normalizeTopUpQueryValue(undefined), undefined);
  assert.equal(sanitizeTopUpReturnPath("/cart"), "/cart");
  assert.equal(sanitizeTopUpReturnPath("https://example.com"), null);
  assert.equal(sanitizeTopUpReturnPath("//example.com"), null);
});
