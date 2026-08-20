import { describe, expect, it, vi } from "vitest";

import { CatalogProtocolService } from "./catalog-protocol.service";

type QueryResult<Row> = { rows: Row[] };

const appleRow = {
  id: "apple-ae-aed-50",
  slug: "apple-ae-aed-50",
  title: "Подарочная карта Apple",
  description: "Пополняйте баланс Apple ID подарочной картой App Store & iTunes.",
  price_coin_minor: 172659,
  availability: "available",
  created_at: new Date("2026-08-14T15:00:31.585Z"),
  updated_at: new Date("2026-08-14T16:00:31.585Z"),
  public_enabled: true,
  popularity: 20,
  image: "https://cdn.example/apple.png",
  image_alt: "Apple gift card",
  meta: ["ОАЭ", "50 AED"],
  keywords: ["apple", "itunes"],
  details: {
    fulfillment: {
      title: "Ручная выдача",
      description: "Код вручную отправит команда Vault после оплаты.",
      requirements: ["Регион Apple ID должен соответствовать выбранной карте."],
    },
    appleGiftCard: {
      currency: "AED",
      nominalMinor: 5000,
      regionCode: "AE",
      regionLabel: "ОАЭ",
    },
    specifications: [
      { label: "Регион", value: "ОАЭ" },
      { label: "Номинал", value: "50 AED" },
    ],
  },
};

describe("CatalogProtocolService", () => {
  it("lists only the Apple gift-card category and Apple-card products", async () => {
    const service = createService();

    expect(service.listCategories()).toEqual({
      items: [
        {
          id: "apple_gift_card",
          revision: "apple_gift_card",
          parentId: null,
          name: "Подарочные карты Apple",
          slug: "apple-gift-cards",
          image: null,
          sortOrder: 0,
          isActive: true,
        },
      ],
      nextCursor: null,
    });
    await expect(service.listProducts()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "apple-ae-aed-50",
          categoryId: "apple_gift_card",
          title: "Подарочная карта Apple",
          media: [
            {
              id: "apple-ae-aed-50-primary",
              url: "https://cdn.example/apple.png",
              alt: { ru: "Apple gift card" },
            },
          ],
          isActive: true,
          sortOrder: 20,
          attributes: {
            currency: "AED",
            nominalMinor: 5000,
            regionCode: "AE",
            regionLabel: "ОАЭ",
            fulfillmentTitle: "Ручная выдача",
            fulfillmentDescription: "Код вручную отправит команда Vault после оплаты.",
            fulfillmentRequirement: "Регион Apple ID должен соответствовать выбранной карте.",
          },
        }),
      ],
      nextCursor: null,
    });
  });

  it("exposes one offer per Apple card product with the Coins price", async () => {
    const service = createService();

    await expect(service.listOffers("apple-ae-aed-50")).resolves.toEqual({
      items: [
        {
          id: "apple-ae-aed-50",
          revision: "2026-08-14T16:00:31.585Z",
          productId: "apple-ae-aed-50",
          sellerId: null,
          price: { amountMinor: 172659, currency: "COINS", scale: 100 },
          availability: { quantity: 1, unit: "code" },
          minimumQuantity: 1,
          packageQuantity: 1,
          delivery: null,
          isActive: true,
          attributes: { fulfillmentMode: "manual" },
        },
      ],
      nextCursor: null,
    });
  });

  it("creates, updates, and deletes only Apple gift-card products", async () => {
    const database = createDatabase();
    const service = new CatalogProtocolService(database as never);
    const input = {
      categoryId: "apple_gift_card",
      title: "Apple US 25",
      slug: "apple-us-usd-25",
      description: "US card",
      media: [],
      sortOrder: 10,
      isActive: true,
      attributes: {
        currency: "USD",
        nominalMinor: 2500,
        regionCode: "US",
        regionLabel: "США",
        fulfillmentTitle: "Ручная выдача",
        fulfillmentDescription: "После оплаты код отправит команда Vault.",
        fulfillmentRequirement: "Регион Apple ID должен быть США.",
      },
    };

    await service.createProduct(input);
    await service.updateOffer("apple-us-usd-25", {
      productId: "apple-us-usd-25",
      price: { amountMinor: 318000, currency: "COINS", scale: 100 },
      availability: { quantity: 1, unit: "code" },
      isActive: false,
    });
    await service.deleteProduct("apple-us-usd-25", false);

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO catalog_products"),
      expect.arrayContaining([
        "apple-us-usd-25",
        "apple-us-usd-25",
        "apple_gift_card",
      ]),
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE catalog_products"),
      expect.arrayContaining([318000, false, "apple-us-usd-25"]),
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM catalog_products"),
      ["apple-us-usd-25"],
    );
  });
});

function createService() {
  return new CatalogProtocolService(createDatabase() as never);
}

function createDatabase() {
  return {
    query: vi.fn(<Row>(sql: string): Promise<QueryResult<Row>> => {
      if (sql.includes("FROM order_lines")) {
        return Promise.resolve({ rows: [{ total: "0" }] as Row[] });
      }
      if (sql.includes("SELECT count(*)::text AS total")) {
        return Promise.resolve({ rows: [{ total: "1" }] as Row[] });
      }
      if (sql.includes("FROM catalog_products")) {
        return Promise.resolve({ rows: [appleRow] as Row[] });
      }
      return Promise.resolve({ rows: [appleRow] as Row[] });
    }),
  };
}
