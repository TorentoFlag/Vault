import assert from "node:assert/strict";
import test from "node:test";

import {
  createCheckoutLock,
  getCartSummary,
  getCartItemsLabel,
  normalizeCartIds,
  resolveCartProducts,
} from "./cart.ts";

const products = [
  { id: "skin", priceCoins: 2840 },
  { id: "steam", priceCoins: 1500 },
  { id: "gpt", priceCoins: 4200 },
];

test("корзина сохраняет порядок добавления и игнорирует неизвестные id", () => {
  assert.deepEqual(
    resolveCartProducts(products, ["gpt", "missing", "skin"]).map((item) => item.id),
    ["gpt", "skin"],
  );
});

test("id корзины очищаются от дублей и неизвестных товаров", () => {
  assert.deepEqual(normalizeCartIds(["skin", "skin", "missing", "gpt"], products), [
    "skin",
    "gpt",
  ]);
});

test("сводка показывает итог и дефицит Coins", () => {
  assert.deepEqual(getCartSummary(products.slice(0, 2), 1000), {
    itemCount: 2,
    totalCoins: 4340,
    balanceCoins: 1000,
    shortfallCoins: 3340,
    remainingCoins: 0,
    canPurchase: false,
  });
});

test("покупка доступна только для непустой корзины с достаточным балансом", () => {
  assert.equal(getCartSummary(products.slice(0, 1), 2840).canPurchase, true);
  assert.equal(getCartSummary([], 10000).canPurchase, false);
});

test("после покупки рассчитывается остаток, а отрицательный баланс нормализуется", () => {
  assert.equal(getCartSummary(products.slice(0, 1), 3000).remainingCoins, 160);
  assert.equal(getCartSummary(products.slice(0, 1), -50).balanceCoins, 0);
});

test("счётчик корзины склоняет количество товаров", () => {
  assert.equal(getCartItemsLabel(1), "1 товар");
  assert.equal(getCartItemsLabel(2), "2 товара");
  assert.equal(getCartItemsLabel(5), "5 товаров");
  assert.equal(getCartItemsLabel(21), "21 товар");
});

test("lock оформления отклоняет повторную синхронную покупку до сброса", () => {
  const lock = createCheckoutLock();
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);
  lock.reset();
  assert.equal(lock.acquire(), true);
});
