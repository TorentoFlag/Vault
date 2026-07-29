import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("admin operations read models", () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let tempDir: string | null = null;
  const adminToken = "vault-admin-token-for-tests";

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_API_TOKEN_FILE;
    await app?.close();
    await pool.end();
    if (tempDir !== null) await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    tempDir = await mkdtemp(join(tmpdir(), "vault-admin-"));
    const adminTokenFile = join(tempDir, "admin-token");
    await writeFile(adminTokenFile, `${adminToken}\n`, "utf8");
    process.env.ADMIN_API_TOKEN_FILE = adminTokenFile;
    await pool.query(`
      TRUNCATE
        payment_webhook_events,
        payment_provider_attempts,
        top_up_payments,
        fulfillment_provider_attempts,
        fulfillment_commands,
        cart_items,
        carts,
        order_lines,
        orders,
        wallet_holds,
        wallet_ledger_entries,
        wallet_transactions,
        audit_events,
        steam_trade_credentials,
        steam_openid_assertions,
        steam_auth_attempts,
        user_sessions,
        users
      RESTART IDENTITY
    `);
    await pool.query(
      `
        INSERT INTO users (id, steam_id64, display_name)
        VALUES ('user_76561198000000011', '76561198000000011', 'Ops User')
      `,
    );
    await pool.query(
      `
        INSERT INTO top_up_payments (
          id,
          user_id,
          idempotency_key,
          request_hash,
          provider,
          status,
          coin_amount_minor,
          fiat_amount_minor,
          fiat_currency,
          rate_fiat_minor,
          rate_coin_minor,
          provider_session_id,
          provider_status,
          metadata
        )
        VALUES (
          '019facdb-b116-7434-b27c-debea8fb1c30',
          'user_76561198000000011',
          'topup-admin-review',
          'request-hash',
          'arc_pay',
          'manual_review',
          150000,
          100000,
          'RUB',
          100,
          150,
          '019facd9-9e3f-730f-9180-8a43c1499df7',
          'refunded',
          '{"manualReviewReason":"arc_pay_refunded_after_credit","rawSecret":"must-not-leak"}'::jsonb
        )
      `,
    );
    await pool.query(
      `
        INSERT INTO orders (
          id,
          user_id,
          idempotency_key,
          request_hash,
          status,
          total_coin_minor,
          recipient_snapshots
        )
        VALUES (
          '019facdb-b116-7434-b27c-debea8fb1c31',
          'user_76561198000000011',
          'checkout-admin-review',
          'order-request-hash',
          'manual_review',
          200000,
          '[{"kind":"steam-trade","steamId64":"76561198000000011","steamTradePartnerAccountId":"39734273","token":"must-not-leak"}]'::jsonb
        )
      `,
    );
    await pool.query(
      `
        INSERT INTO order_lines (
          id,
          order_id,
          line_index,
          product_id,
          product_slug,
          kind,
          title,
          unit_price_coin_minor,
          quantity,
          recipient_snapshot,
          status
        )
        VALUES (
          '019facdb-b116-7434-b27c-debea8fb1c32',
          '019facdb-b116-7434-b27c-debea8fb1c31',
          1,
          'ak-redline',
          'ak-redline',
          'skins',
          'AK-47 | Redline',
          200000,
          1,
          '{"kind":"steam-trade","steamId64":"76561198000000011","steamTradePartnerAccountId":"39734273","token":"must-not-leak"}'::jsonb,
          'protection_failed'
        )
      `,
    );
    await pool.query(
      `
        INSERT INTO fulfillment_commands (
          id,
          order_id,
          order_line_id,
          provider,
          command_type,
          status,
          idempotency_key,
          payload_snapshot,
          last_error_code
        )
        VALUES (
          '019facdb-b116-7434-b27c-debea8fb1c33',
          '019facdb-b116-7434-b27c-debea8fb1c31',
          '019facdb-b116-7434-b27c-debea8fb1c32',
          'sih',
          'sih_skin_purchase',
          'manual_review',
          'fulfillment-admin-review',
          '{"steamToken":"must-not-leak","marketHashName":"AK-47 | Redline"}'::jsonb,
          'SIH_PROTECTION_ROLLBACK'
        )
      `,
    );
    await pool.query(
      `
        INSERT INTO fulfillment_provider_attempts (
          command_id,
          order_id,
          order_line_id,
          provider,
          operation,
          status,
          idempotency_key,
          provider_order_id,
          request_snapshot,
          response_snapshot,
          error_code
        )
        VALUES (
          '019facdb-b116-7434-b27c-debea8fb1c33',
          '019facdb-b116-7434-b27c-debea8fb1c31',
          '019facdb-b116-7434-b27c-debea8fb1c32',
          'sih',
          'get_order',
          'succeeded',
          'attempt-admin-review',
          'sih-order-1',
          '{"apikey":"must-not-leak"}'::jsonb,
          '{"token":"must-not-leak"}'::jsonb,
          null
        )
      `,
    );
    await pool.query(
      `
        INSERT INTO payment_webhook_events (
          provider,
          provider_event_id,
          status,
          signature_status,
          payload_snapshot,
          processed_at
        )
        VALUES (
          'arc_pay',
          'evt-admin-rejected',
          'rejected_amount_mismatch',
          'verified',
          '{"token":"must-not-leak","event_type":"payment.captured"}'::jsonb,
          now()
        )
      `,
    );
    app = await createApp();
  });

  it("requires an admin token and returns redacted operational problem rows without mutation endpoints", async () => {
    await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .get("/admin/operations/overview")
      .expect(401);
    await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/admin/operations/overview")
      .set("x-admin-token", adminToken)
      .expect(404);

    const response = await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .get("/admin/operations/overview")
      .set("x-admin-token", adminToken)
      .expect(200);

    expect(response.body).toMatchObject({
      payments: {
        manualReview: [{
          id: "019facdb-b116-7434-b27c-debea8fb1c30",
          userId: "user_76561198000000011",
          status: "manual_review",
          provider: "arc_pay",
          providerStatus: "refunded",
          coinAmountMinor: 150000,
          fiatAmountMinor: 100000,
          fiatCurrency: "RUB",
          manualReviewReason: "arc_pay_refunded_after_credit",
        }],
      },
      orders: {
        problem: [{
          id: "019facdb-b116-7434-b27c-debea8fb1c31",
          userId: "user_76561198000000011",
          status: "manual_review",
          totalCoinMinor: 200000,
          lineCount: 1,
          openLineCount: 1,
        }],
      },
      fulfillment: {
        commands: [{
          id: "019facdb-b116-7434-b27c-debea8fb1c33",
          orderId: "019facdb-b116-7434-b27c-debea8fb1c31",
          orderLineId: "019facdb-b116-7434-b27c-debea8fb1c32",
          provider: "sih",
          commandType: "sih_skin_purchase",
          status: "manual_review",
          lastErrorCode: "SIH_PROTECTION_ROLLBACK",
          lastAttemptOperation: "get_order",
          lastAttemptStatus: "succeeded",
        }],
      },
      webhooks: {
        problem: [{
          provider: "arc_pay",
          providerEventId: "evt-admin-rejected",
          status: "rejected_amount_mismatch",
          signatureStatus: "verified",
        }],
      },
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("payloadSnapshot");
    expect(serialized).not.toContain("requestSnapshot");
    expect(serialized).not.toContain("responseSnapshot");
  });
});
