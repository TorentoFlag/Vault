import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildHomeHeroModel } from "./home-hero.ts";
import type { Product } from "../types/commerce.ts";

const homePageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function product(id: string, kind: Product["kind"]): Product {
  return {
    id,
    slug: id,
    kind,
    category: kind === "apple_gift_card" ? "Подарочные карты Apple" : kind === "steam" ? "Steam" : "Игровые предметы",
    productType: kind,
    title: id,
    description: "Описание",
    priceCoins: 100,
    availability: "available",
    fulfillmentMode: kind === "apple_gift_card" ? "manual" : kind === "skins" ? "steam-trade" : "automatic",
    createdAt: "2026-08-14T00:00:00.000Z",
    popularity: 1,
    meta: [],
    details: {
      specifications: [],
      fulfillment: {
        title: "Получение",
        description: "Описание получения",
        requirements: [],
      },
    },
  };
}

test("главный hero показывает Apple-карты первым предложением каталога", () => {
  const model = buildHomeHeroModel([
    product("skin-first", "skins"),
    product("steam", "steam"),
    product("skin-second", "skins"),
  ], [
    product("apple-card", "apple_gift_card"),
  ]);

  assert.deepEqual(model.heroCards.map((item) => item.id), ["apple-card", "skin-first", "skin-second"]);
});

test("главный hero выводит Apple в надзаголовке, подзаголовке и быстром поиске", () => {
  const model = buildHomeHeroModel([]);

  assert.deepEqual(model.signalLabels, ["Steam marketplace", "подарочные карты Apple", "Игровые предметы"]);
  assert.equal(model.subtitle, "Подарочные карты Apple, пополнение Steam, покупка игровых предметов с ценами в Coins.");
  assert.deepEqual(model.quickSearches.map((item) => item.title), ["Подарочные карты Apple", "Steam", "CS2", "Rust", "Team Fortress 2"]);
  assert.equal(model.quickSearches[0]?.description, undefined);
  assert.equal(model.quickSearches[0]?.href, "/catalog?category=apple_gift_card");
});

test("главная отдельно запрашивает Apple-карту для первой карточки hero", () => {
  assert.match(homePageSource, /createDefaultCatalogFilters/);
  assert.match(homePageSource, /category:\s*"apple_gift_card"/);
  assert.match(homePageSource, /limit:\s*1/);
  assert.match(homePageSource, /<Hero products=\{catalog\.items\} featuredProducts=\{appleCatalog\.items\} \/>/);
});
