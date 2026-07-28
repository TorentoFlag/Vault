import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import type { CatalogListDto } from "./catalog.types";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const deagleMarketHashName = "Desert Eagle | Printstream (Minimal Wear)";

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

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = $1", [deagleMarketHashName]);
    await pool.query("DELETE FROM catalog_sync_runs WHERE source = 'sih' AND game = 'cs2' AND metadata ->> 'test' = 'catalog-live-price'");
    delete process.env.DATABASE_URL;
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    app = await createApp();
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = $1", [deagleMarketHashName]);
    await pool.query("DELETE FROM catalog_sync_runs WHERE source = 'sih' AND game = 'cs2' AND metadata ->> 'test' = 'catalog-live-price'");
  });

  it("serves first-release catalog rows from PostgreSQL seed data", async () => {
    const seeded = await pool.query<{ total: string; gpt_total: string }>(
      "SELECT count(*) AS total, count(*) FILTER (WHERE kind = 'gpt') AS gpt_total FROM catalog_products",
    );
    expect(Number(seeded.rows[0]?.total)).toBeGreaterThan(0);
    expect(Number(seeded.rows[0]?.gpt_total)).toBe(0);

    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .query({ q: "Пистолет" })
      .expect(200);
    const body = response.body as CatalogListDto;

    expect(body.items.map((item) => item.slug)).toEqual(["desert-eagle-printstream"]);
    expect(body.items[0]?.price).toMatchObject({
      currency: "COINS",
      amountMinor: 318000,
      scale: 2,
    });
  });

  it("quotes supplier-linked skin products from the latest active SIH listing", async () => {
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

    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/catalog")
      .query({ q: "Пистолет" })
      .expect(200);
    const body = response.body as CatalogListDto;

    expect(body.items.map((item) => item.slug)).toEqual(["desert-eagle-printstream"]);
    expect(body.items[0]?.price).toEqual({
      currency: "COINS",
      amountMinor: 18100,
      scale: 2,
      display: "181 Coins",
    });
  });
});
