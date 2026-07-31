import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import type { CatalogListDto } from "./catalog.types";
import { CatalogSupplierSyncService } from "./catalog-supplier-sync.service";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const deagleMarketHashName = "Desert Eagle | Printstream (Minimal Wear)";
const deagleProjectedSlug = "desert-eagle-printstream-minimal-wear-b26c34c3";

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("catalog PostgreSQL persistence", () => {
  let app: INestApplication;
  let pool: Pool;

  async function insertDeagleListing() {
    const run = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog_sync_runs (source, game, status, observed_at, finished_at, row_count, metadata)
        VALUES ('sih', 'cs2', 'promoted', '2026-07-28T10:00:00.000Z', '2026-07-28T10:00:01.000Z', 1, '{"test":"catalog-live-price"}'::jsonb)
        RETURNING id
      `,
    );
    const runId = run.rows[0]?.id;
    expect(runId).toBeDefined();
    await pool.query(
      `
        INSERT INTO supplier_listings (
          supplier,
          game,
          market_hash_name,
          active,
          available_quantity,
          price_microusd,
          image_url,
          snapshot,
          first_seen_at,
          last_seen_at,
          last_sync_run_id
        )
        VALUES ('sih', 'cs2', $1, true, 3, 1011000, 'https://cdn.example/deagle.png', '{}'::jsonb, '2026-07-28T10:00:00.000Z', '2026-07-28T10:00:00.000Z', $2)
      `,
      [deagleMarketHashName, runId],
    );
  }

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = $1", [deagleMarketHashName]);
    await pool.query("DELETE FROM catalog_sync_runs WHERE source = 'sih' AND game = 'cs2' AND metadata ->> 'test' = 'catalog-live-price'");
    await pool.query("DELETE FROM catalog_products WHERE supplier_provider = 'sih' AND supplier_item_id = $1", [deagleMarketHashName]);
    delete process.env.DATABASE_URL;
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    app = await createApp();
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = $1", [deagleMarketHashName]);
    await pool.query("DELETE FROM catalog_sync_runs WHERE source = 'sih' AND game = 'cs2' AND metadata ->> 'test' = 'catalog-live-price'");
    await pool.query("DELETE FROM catalog_products WHERE supplier_provider = 'sih' AND supplier_item_id = $1", [deagleMarketHashName]);
  });

  it("serves provider-backed CS2 catalog rows promoted from active SIH listings", async () => {
    const seeded = await pool.query<{ total: string; gpt_total: string }>(
      "SELECT count(*) AS total, count(*) FILTER (WHERE kind = 'gpt') AS gpt_total FROM catalog_products",
    );
    expect(Number(seeded.rows[0]?.total)).toBeGreaterThan(0);
    expect(Number(seeded.rows[0]?.gpt_total)).toBe(0);
    await insertDeagleListing();
    const promoted = await app.get(CatalogSupplierSyncService).promoteActiveSihListings("cs2");
    expect(promoted.promotedProductCount).toBeGreaterThanOrEqual(1);

    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .query({ q: "Пистолет" })
      .expect(200);
    const body = response.body as CatalogListDto;

    expect(body.items.map((item) => item.slug)).toEqual([deagleProjectedSlug]);
    expect(body.items[0]?.price).toEqual({
      currency: "COINS",
      amountMinor: 18100,
      scale: 2,
      display: "181 Coins",
    });
    expect(body.items[0]?.game).toBe("CS2");
  });

  it("does not publish non-CS2 seeded skin categories", async () => {
    await pool.query("UPDATE catalog_products SET public_enabled = false WHERE kind = 'skins' AND game <> 'CS2'");

    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .expect(200);
    const body = response.body as CatalogListDto;

    expect(body.facets.games.map((item) => item.id)).not.toContain("Dota 2");
    expect(body.facets.games.map((item) => item.id)).not.toContain("Rust");
    expect(body.items.filter((item) => item.kind === "skins").every((item) => item.game === "CS2")).toBe(true);
  });

  it("quotes supplier-linked skin products from the latest active SIH listing", async () => {
    await insertDeagleListing();
    const promoted = await app.get(CatalogSupplierSyncService).promoteActiveSihListings("cs2");
    expect(promoted.promotedProductCount).toBeGreaterThanOrEqual(1);

    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .query({ q: "Пистолет" })
      .expect(200);
    const body = response.body as CatalogListDto;

    expect(body.items.map((item) => item.slug)).toEqual([deagleProjectedSlug]);
    expect(body.items[0]?.price).toEqual({
      currency: "COINS",
      amountMinor: 18100,
      scale: 2,
      display: "181 Coins",
    });
  });

  it("returns catalog pagination metadata instead of making the first page look exhaustive", async () => {
    await insertDeagleListing();
    const promoted = await app.get(CatalogSupplierSyncService).promoteActiveSihListings("cs2");
    expect(promoted.promotedProductCount).toBeGreaterThanOrEqual(1);

    const firstPageResponse = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .query({ category: "skins", q: "CS2", limit: 1, offset: 0 })
      .expect(200);
    const firstPage = firstPageResponse.body as CatalogListDto;

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.pagination.limit).toBe(1);
    expect(firstPage.pagination.offset).toBe(0);
    expect(firstPage.pagination.total).toBeGreaterThanOrEqual(1);
    expect(firstPage.pagination.hasMore).toBe(firstPage.pagination.total > 1);

    if (firstPage.pagination.total > 1) {
      const secondPageResponse = await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get("/catalog")
        .query({ category: "skins", q: "CS2", limit: 1, offset: 1 })
        .expect(200);
      const secondPage = secondPageResponse.body as CatalogListDto;

      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.pagination.limit).toBe(1);
      expect(secondPage.pagination.offset).toBe(1);
      expect(secondPage.pagination.total).toBe(firstPage.pagination.total);
      expect(secondPage.items[0]?.slug).not.toBe(firstPage.items[0]?.slug);
    }
  });
});
