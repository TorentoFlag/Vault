import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import type { CatalogListDto } from "./catalog.types";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;

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
    delete process.env.DATABASE_URL;
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    app = await createApp();
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
});
