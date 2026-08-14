import { describe, expect, it } from "vitest";

import { CatalogService } from "./catalog.service";
import type { CatalogPricingService } from "./catalog-pricing.service";

type QueryResult<Row> = { rows: Row[] };

const appleRow = {
  id: "apple-ru-500",
  slug: "apple-ru-500",
  kind: "apple_gift_card",
  category: "Подарочная карта Apple",
  game: null,
  product_type: "Подарочная карта App Store & iTunes",
  title: "Подарочная карта Apple",
  description: "Пополняйте баланс Apple ID подарочной картой App Store & iTunes. Код вручную отправит команда Vault после оплаты.",
  price_coin_minor: 75000,
  effective_price_coin_minor: "75000",
  availability: "available",
  fulfillment_mode: "manual",
  created_at: new Date("2026-08-12T15:45:35.355Z"),
  popularity: 100,
  image: null,
  image_alt: null,
  meta: ["Россия", "500 RUB"],
  keywords: ["apple", "itunes", "подарочная карта"],
  details: {
    specifications: [
      { label: "Регион", value: "Россия" },
      { label: "Номинал", value: "500 RUB" },
    ],
    fulfillment: {
      title: "Ручная выдача",
      description: "Код вручную отправит команда Vault после оплаты.",
      requirements: ["Регион Apple ID должен соответствовать выбранной карте."],
    },
    appleGiftCard: {
      currency: "RUB",
      nominalMinor: 50000,
      regionCode: "RU",
      regionLabel: "Россия",
    },
  },
  supplier_price_microusd: null,
};

describe("CatalogService", () => {
  function createService(row = appleRow) {
    const database = {
      query<Row>(sql: string): Promise<QueryResult<Row>> {
        const isConstrainedToSkins = sql.includes("catalog_products.kind = 'skins'");

        if (sql.includes("SELECT count(*)::text AS total")) {
          return Promise.resolve({ rows: [{ total: isConstrainedToSkins ? "0" : "1" }] as Row[] });
        }

        if (sql.includes("SELECT DISTINCT") || sql.includes("jsonb_array_elements")) {
          return Promise.resolve({ rows: [] });
        }

        if (sql.includes("catalog_products.id")) {
          return Promise.resolve({ rows: (isConstrainedToSkins ? [] : [row]) as Row[] });
        }

        return Promise.resolve({ rows: [] });
      },
    };
    const pricing = {
      quoteSupplierPrice: () => Promise.reject(new Error("supplier pricing must not be used for manual Apple gift cards")),
    } as unknown as CatalogPricingService;

    return new CatalogService(database as never, pricing);
  }

  it("keeps the default public catalog constrained to skins", async () => {
    const service = createService();

    const result = await service.list({ q: "apple" });

    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it("includes Apple gift cards only when their catalog category is selected", async () => {
    const service = createService();

    const result = await service.list({ category: "apple_gift_card", q: "apple" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.kind).toBe("apple_gift_card");
    expect(result.items[0]?.slug).toBe("apple-ru-500");
    expect(result.items[0]?.description).toBe("Пополняйте баланс Apple ID подарочной картой App Store & iTunes.");
    expect(result.items[0]?.description).not.toContain("Код вручную отправит");
    expect(result.pagination.total).toBe(1);
  });

  it("does not expose a sub-nominal Apple gift-card price from malformed catalog data", async () => {
    const service = createService({
      ...appleRow,
      price_coin_minor: 1,
      effective_price_coin_minor: "1",
    });

    const product = await service.getBySlug("apple-ru-500");

    expect(product.price.amountMinor).toBe(50_000);
    expect(product.price.display).toBe("500 Coins");
  });
});
