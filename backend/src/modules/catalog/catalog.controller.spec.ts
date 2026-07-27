import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import type { CatalogListDto, CatalogProductDto } from "./catalog.types";

describe("CatalogModule", () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists first-release products with Coins quotes and no GPT items", async () => {
    const response = await request(httpServer).get("/catalog").expect(200);
    const body = response.body as CatalogListDto;

    expect(body.pricing.coinRate).toEqual({
      fiatCurrency: "RUB",
      fiatMinor: 100,
      coinMinor: 150,
      display: "1 RUB = 1.5 Coins",
    });
    expect(body.items.length).toBeGreaterThan(0);
    expect(new Set(body.items.map((item) => item.kind))).toEqual(new Set(["skins", "steam"]));
    expect(body.items.find((item) => item.slug === "gpt-plus-one-month")).toBeUndefined();
    expect(body.items[0]?.price).toMatchObject({
      currency: "COINS",
      scale: 2,
    });
    expect(body.items[0]?.price.amountMinor).toBeGreaterThan(0);
  });

  it("searches exact product keywords without category count badges", async () => {
    const pistol = await request(httpServer)
      .get("/catalog")
      .query({ q: "Пистолет" })
      .expect(200);
    const pistolBody = pistol.body as CatalogListDto;
    expect(pistolBody.items.map((item) => item.slug)).toEqual(["desert-eagle-printstream"]);

    const rifle = await request(httpServer)
      .get("/catalog")
      .query({ q: "Автомат" })
      .expect(200);
    const rifleBody = rifle.body as CatalogListDto;
    expect(rifleBody.items.map((item) => item.slug)).toEqual([
      "ak-47-redline",
      "m4a1-s-printstream",
    ]);

    expect(rifleBody.facets.kinds).toEqual([
      { id: "skins", title: "Игровые предметы" },
      { id: "steam", title: "Steam" },
    ]);
  });

  it("returns details by slug and hides deferred GPT products", async () => {
    const product = await request(httpServer)
      .get("/catalog/ak-47-redline")
      .expect(200);
    const body = product.body as CatalogProductDto;
    expect(body).toMatchObject({
      slug: "ak-47-redline",
      kind: "skins",
      price: {
        currency: "COINS",
        amountMinor: 284000,
        scale: 2,
      },
    });
    expect(body.details.fulfillment.requirements.length).toBeGreaterThan(0);

    await request(httpServer)
      .get("/catalog/gpt-plus-one-month")
      .expect(404);
  });
});
