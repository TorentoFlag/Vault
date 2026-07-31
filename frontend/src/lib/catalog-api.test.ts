import assert from "node:assert/strict";
import test from "node:test";

import { mapApiCatalogProduct, fetchCatalogList } from "./catalog-api.ts";

const apiProduct = {
  id: "deagle-printstream",
  slug: "desert-eagle-printstream",
  kind: "skins",
  category: "Игровые предметы",
  game: "cs2",
  productType: "Пистолет",
  title: "Desert Eagle | Printstream",
  description: "Backend-owned catalog product with a SIH-backed quote in Coins.",
  price: {
    currency: "COINS",
    amountMinor: 18_100,
    scale: 2,
    display: "181 Coins",
  },
  availability: "available",
  fulfillmentMode: "steam-trade",
  createdAt: "2026-06-25T10:00:00.000Z",
  popularity: 91,
  image: "/products/deagle-printstream.png",
  imageAlt: "Desert Eagle Printstream из Counter-Strike 2",
  meta: ["CS2", "Minimal Wear", "Float 0.11"],
  keywords: ["пистолет", "оружие", "cs2"],
  details: {
    specifications: [
      { label: "Игра", value: "Counter-Strike 2" },
      { label: "Тип", value: "Пистолет" },
      { label: "Состояние", value: "Немного поношенное" },
    ],
    fulfillment: {
      title: "Данные Steam Trade",
      description: "Товар и Trade URL фиксируются в заказе.",
      requirements: ["Для оформления игрового предмета требуется Steam-сессия."],
    },
  },
};

test("mapApiCatalogProduct converts backend Coins minor quote into Product priceCoins without marking it as mock", () => {
  const product = mapApiCatalogProduct(apiProduct);

  assert.equal(product.id, "deagle-printstream");
  assert.equal(product.kind, "skins");
  assert.equal(product.priceCoins, 181);
  assert.equal(product.isMock, undefined);
  assert.deepEqual(product.details.specifications.map((item) => item.label), [
    "Игра",
    "Тип",
    "Состояние",
  ]);
});

test("fetchCatalogList requests backend catalog with canonical filters and hides GPT products returned by neither backend nor mapper", async () => {
  const requested: string[] = [];
  const response = await fetchCatalogList({
    baseUrl: "https://api.vault.example",
    filters: {
      query: "Пистолет",
      category: "skins",
      types: [],
      conditions: [],
      sort: "price_asc",
      game: "rust",
    },
    fetch: async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({
        items: [apiProduct],
        pagination: {
          limit: 120,
          offset: 0,
          total: 1,
          hasMore: false,
        },
        facets: {},
        pricing: {
          coinRate: {
            fiatCurrency: "RUB",
            fiatMinor: 100,
            coinMinor: 150,
            display: "1 RUB = 1.5 Coins",
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(
    requested[0],
    "https://api.vault.example/catalog?q=%D0%9F%D0%B8%D1%81%D1%82%D0%BE%D0%BB%D0%B5%D1%82&category=skins&game=rust&sort=price_asc",
  );
  assert.deepEqual(response.items.map((product) => product.kind), ["skins"]);
  assert.equal(response.items[0]?.priceCoins, 181);
  assert.deepEqual(response.pagination, {
    limit: 120,
    offset: 0,
    total: 1,
    hasMore: false,
  });
});

test("fetchCatalogList requests catalog pages with limit and offset", async () => {
  const requested: string[] = [];
  const response = await fetchCatalogList({
    baseUrl: "https://api.vault.example",
    limit: 120,
    offset: 240,
    fetch: async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({
        items: [apiProduct],
        pagination: {
          limit: 120,
          offset: 240,
          total: 17_574,
          hasMore: true,
        },
        facets: {},
        pricing: {
          coinRate: {
            fiatCurrency: "RUB",
            fiatMinor: 100,
            coinMinor: 150,
            display: "1 RUB = 1.5 Coins",
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(requested[0], "https://api.vault.example/catalog?limit=120&offset=240");
  assert.equal(response.items.length, 1);
  assert.deepEqual(response.pagination, {
    limit: 120,
    offset: 240,
    total: 17_574,
    hasMore: true,
  });
});
