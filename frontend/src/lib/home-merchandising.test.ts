import assert from "node:assert/strict";
import test from "node:test";

import { createPopularGridEntries, getMerchandisingCopy, orderMerchandisingProducts } from "./home-merchandising.ts";

const products = Array.from({ length: 7 }, (_, index) => ({
  id: `product-${index + 1}`,
  category: index === 6 ? "GPT" : "Игровые предметы",
  title: `Товар ${index + 1}`,
  description: "Описание товара",
  kind: index === 6 ? ("gpt" as const) : ("skins" as const),
}));

test("популярные товары заполняют две строки, а ссылка на каталог занимает седьмую позицию", () => {
  const entries = createPopularGridEntries(products, "all");

  assert.equal(entries.length, 8);
  assert.equal(entries[6]?.type, "catalog-link");
  assert.equal(entries[7]?.type, "product");
});

test("фильтр категории не добавляет карточку перехода в каталог", () => {
  const entries = createPopularGridEntries(products, "skins");

  assert.ok(entries.every((entry) => entry.type === "product"));
});

test("популярное чередует категории, а бестселлеры сохраняют рейтинг продаж", () => {
  const ranked = [
    { ...products[0], popularity: 100 },
    { ...products[1], popularity: 90 },
    { ...products[6], popularity: 80 },
  ];
  assert.notDeepEqual(orderMerchandisingProducts(ranked, "popular").map((item) => item.id), orderMerchandisingProducts(ranked, "bestsellers").map((item) => item.id));
  assert.deepEqual(orderMerchandisingProducts(ranked, "bestsellers").map((item) => item.id), ["product-1", "product-2", "product-7"]);
});

test("heading and description follow the selected merchandising collection", () => {
  assert.deepEqual(getMerchandisingCopy("popular"), {
    title: "Популярные товары",
    description: "Товары, которые чаще всего выбирают пользователи.",
  });
  assert.match(getMerchandisingCopy("bestsellers").title, /Бестселлер/);
  assert.match(getMerchandisingCopy("new").title, /Новин/);
});
