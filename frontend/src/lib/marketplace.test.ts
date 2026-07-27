import assert from "node:assert/strict";
import test from "node:test";

import {
  convertCoins,
  filterProducts,
  getCartNotice,
  normalizeCalculatorAmount,
  searchProducts,
  summarizeSteamTopUp,
} from "./marketplace.ts";

const products = [
  {
    id: "ak-redline",
    category: "Игровые предметы",
    title: "AK-47 | Redline",
    description: "Винтовка CS2, полевые испытания",
    kind: "skins" as const,
    keywords: ["автомат", "винтовка"],
  },
  {
    id: "steam-1000",
    category: "Steam",
    title: "Пополнение Steam",
    description: "Пополнение баланса аккаунта",
    kind: "steam" as const,
  },
  {
    id: "awp-asiimov",
    category: "Игровые предметы",
    title: "AWP | Asiimov",
    description: "Снайперская винтовка CS2",
    kind: "skins" as const,
    keywords: ["снайперская", "винтовка"],
  },
  {
    id: "deagle-printstream",
    category: "Игровые предметы",
    title: "Desert Eagle | Printstream",
    description: "Пистолет CS2",
    kind: "skins" as const,
    keywords: ["пистолет"],
  },
  {
    id: "gpt-plus",
    category: "GPT",
    title: "GPT Plus",
    description: "Оплата доступа к сервису",
    kind: "gpt" as const,
  },
];

test("поиск находит товар по связанному слову", () => {
  assert.deepEqual(searchProducts(products, "автомат").map((item) => item.id), [
    "ak-redline",
  ]);
});

test("autocomplete и каталог используют одинаковый токенизированный поиск", () => {
  const products = [
    { id: "one", category: "CS2", title: "AK-47 Redline", description: "Автомат после полевых испытаний", kind: "skins" as const, keywords: ["красный"] },
    { id: "two", category: "Steam", title: "Пополнение Steam", description: "Баланс", kind: "steam" as const },
  ];

  assert.deepEqual(searchProducts(products, "красный автомат").map((product) => product.id), ["one"]);
  assert.deepEqual(searchProducts(products, "АВТОМАТ красный").map((product) => product.id), ["one"]);
});

test("поиск по типу оружия не возвращает все игровые предметы", () => {
  assert.deepEqual(searchProducts(products, "пистолет").map((item) => item.id), [
    "deagle-printstream",
  ]);
});

test("фильтр оставляет товары выбранной категории", () => {
  assert.deepEqual(filterProducts(products, "steam").map((item) => item.id), [
    "steam-1000",
  ]);
});

test("конвертер работает в обоих направлениях", () => {
  assert.equal(convertCoins(1000, "rub-to-coins", 1.5), 1500);
  assert.equal(convertCoins(1500, "coins-to-rub", 1.5), 1000);
});

test("Steam расчет возвращает Coins по централизованному курсу", () => {
  assert.deepEqual(summarizeSteamTopUp(1000, 1.5), {
    rubles: 1000,
    coins: 1500,
    rate: 1.5,
  });
});

test("калькуляторы отклоняют отрицательные и дробные значения", () => {
  assert.equal(normalizeCalculatorAmount("-10"), 0);
  assert.equal(normalizeCalculatorAmount("10.5"), 0);
  assert.equal(normalizeCalculatorAmount(""), 0);
  assert.equal(normalizeCalculatorAmount("1500"), 1500);
});

test("уведомление корзины не зависит от рода названия товара", () => {
  assert.equal(
    getCartNotice("Пополнение Steam на 1000 ₽"),
    "Товар «Пополнение Steam на 1000 ₽» добавлен в корзину.",
  );
});
