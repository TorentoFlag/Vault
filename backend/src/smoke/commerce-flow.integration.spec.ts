import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../app.module";
import { CUSTOMER_SESSION_COOKIE } from "../modules/sessions/session-cookies";
import { SessionsService } from "../modules/sessions/sessions.service";
import { FulfillmentService } from "../modules/fulfillment/fulfillment.service";
import { PaymentsService } from "../modules/payments/payments.service";
import { UsersService } from "../modules/users/users.service";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const steamId64 = "76561198000000011";
const userId = `user_${steamId64}`;
const commerceSmokeMarketHashName = "Commerce Smoke Deagle | Printstream (Minimal Wear)";
const commerceSmokeSkinSlug = "commerce-smoke-desert-eagle-printstream";

type TopUpSessionResponse = {
  checkoutUrl: string;
  coinAmountMinor: number;
  fiatAmountMinor: number;
  id: string;
  status: string;
};

type CheckoutResponse = {
  id: string;
  totalCoinMinor: number;
};

function requireRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("Expected response object");
}

function arrayField(value: unknown, name: string): unknown[] {
  const record = requireRecord(value);
  const field = record[name];
  if (Array.isArray(field)) return field;
  throw new Error(`Expected ${name} array`);
}

function topUpSessionResponse(value: unknown): TopUpSessionResponse {
  const record = requireRecord(value);
  if (
    typeof record.id === "string" &&
    typeof record.checkoutUrl === "string" &&
    typeof record.status === "string" &&
    Number.isSafeInteger(record.coinAmountMinor) &&
    Number.isSafeInteger(record.fiatAmountMinor)
  ) {
    return record as TopUpSessionResponse;
  }
  throw new Error("Unexpected top-up session response");
}

function checkoutResponse(value: unknown): CheckoutResponse {
  const record = requireRecord(value);
  if (typeof record.id === "string" && Number.isSafeInteger(record.totalCoinMinor)) return record as CheckoutResponse;
  throw new Error("Unexpected checkout response");
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("commerce smoke", () => {
  let app: INestApplication | null = null;
  let fulfillment: FulfillmentService;
  let payments: PaymentsService;
  let pool: Pool;
  let sessions: SessionsService;
  let tempDir: string | null = null;
  let users: UsersService;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
    originalFetch = globalThis.fetch;
  });

  afterAll(async () => {
    delete process.env.ADMIN_API_TOKEN_FILE;
    delete process.env.ARC_PAY_PROVIDER_MODE;
    delete process.env.ARC_PAY_PUBLIC_ORIGIN;
    delete process.env.ARC_PAY_SECRET_KEY_FILE;
    delete process.env.DATABASE_URL;
    delete process.env.SIH_API_KEY_FILE;
    globalThis.fetch = originalFetch;
    await app?.close();
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = $1", [commerceSmokeMarketHashName]);
    await pool.query("DELETE FROM catalog_products WHERE id = 'commerce-smoke-deagle-printstream'");
    await pool.query("DELETE FROM catalog_sync_runs WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'");
    await pool.end();
    if (tempDir !== null) await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    globalThis.fetch = originalFetch;
    tempDir = await mkdtemp(join(tmpdir(), "vault-commerce-smoke-"));
    const adminTokenFile = join(tempDir, "admin-token");
    const arcPaySecretKeyFile = join(tempDir, "arc-pay-secret");
    const sihApiKeyFile = join(tempDir, "sih-api-key");
    await writeFile(adminTokenFile, "vault-commerce-smoke-admin-token\n", "utf8");
    await writeFile(arcPaySecretKeyFile, "sk_test_commerce_smoke\n", "utf8");
    await writeFile(sihApiKeyFile, "test-sih-commerce-smoke\n", "utf8");
    process.env.ADMIN_API_TOKEN_FILE = adminTokenFile;
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://vault.example";
    process.env.ARC_PAY_SECRET_KEY_FILE = arcPaySecretKeyFile;
    process.env.SIH_API_KEY_FILE = sihApiKeyFile;

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
        idempotency_keys,
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
        INSERT INTO catalog_products (
          id,
          slug,
          kind,
          category,
          game,
          product_type,
          title,
          description,
          price_coin_minor,
          availability,
          fulfillment_mode,
          popularity,
          image,
          image_alt,
          meta,
          keywords,
          details,
          supplier_provider,
          supplier_item_id,
          supplier_snapshot,
          supplier_fresh_at,
          public_enabled
        )
        VALUES ('commerce-smoke-deagle-printstream', $1, 'skins', 'Игровые предметы', 'CS2', 'Пистолет', 'Desert Eagle | Printstream', 'Smoke fixture for SIH skin fulfillment.', 318000, 'available', 'steam-trade', 1, '/products/deagle-printstream.png', 'Desert Eagle Printstream из Counter-Strike 2', ARRAY['CS2', 'Minimal Wear'], ARRAY['пистолет', 'оружие', 'cs2'], '{"specifications":[],"fulfillment":{"title":"Steam Trade","description":"Trade URL required.","requirements":[]}}'::jsonb, NULL, $2, '{}'::jsonb, NULL, true)
        ON CONFLICT (id) DO UPDATE
        SET slug = EXCLUDED.slug,
            supplier_item_id = EXCLUDED.supplier_item_id,
            price_coin_minor = EXCLUDED.price_coin_minor,
            public_enabled = true,
            updated_at = clock_timestamp()
      `,
      [commerceSmokeSkinSlug, commerceSmokeMarketHashName],
    );
    await pool.query(`
      INSERT INTO catalog_sync_runs (id, source, game, status, observed_at, finished_at, row_count, metadata)
      VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sih', 'cs2', 'promoted', '2026-07-29T10:00:00.000Z', '2026-07-29T10:00:01.000Z', 1, '{"test":"commerce-smoke"}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
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
      VALUES ('sih', 'cs2', $1, true, 3, 1011000, NULL, '{}'::jsonb, '2026-07-29T10:00:00.000Z', '2026-07-29T10:00:00.000Z', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      ON CONFLICT (supplier, game, market_hash_name) DO UPDATE
      SET active = EXCLUDED.active,
          available_quantity = EXCLUDED.available_quantity,
          price_microusd = EXCLUDED.price_microusd,
          last_sync_run_id = EXCLUDED.last_sync_run_id,
          last_seen_at = EXCLUDED.last_seen_at
    `, [commerceSmokeMarketHashName]);
  });

  it("proves Coins top-up, mixed checkout, SIH skin delivery, Steam refill delivery, and customer history projections", async () => {
    let createdTopUpId: string | null = null;
    let createdTopUpFiatMinor: number | null = null;
    let skinCustomId: string | null = null;
    const providerRequests: Array<{ body: unknown; path: string }> = [];

    globalThis.fetch = (input, init) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);

      if (url.href === "https://api.arcpay.space/v1/checkout/sessions") {
        if (typeof init?.body !== "string") throw new Error("Expected Arc Pay JSON body");
        const body = JSON.parse(init.body) as Record<string, unknown>;
        providerRequests.push({ body, path: url.pathname });
        createdTopUpId = typeof body.external_id === "string" ? body.external_id : null;
        createdTopUpFiatMinor = typeof body.amount === "number" ? body.amount : null;
        expect(body.payment_methods).toEqual([{ method: "sbp", payment_mode: "h2h" }]);
        return Promise.resolve(new Response(JSON.stringify({
          id: "019fad28-0971-71be-8630-60af5e21f2c1",
          url: "https://checkout.arcpay.space/sessions/019fad28",
        }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url.pathname === "/v1/payments") {
        providerRequests.push({ body: null, path: `${url.pathname}?${url.searchParams.toString()}` });
        expect(url.searchParams.get("search")).toBe(createdTopUpId);
        if (createdTopUpId === null || createdTopUpFiatMinor === null) throw new Error("Top-up session was not created before reconciliation");
        return Promise.resolve(new Response(JSON.stringify({
          payments: [{
            id: "019fad28-0971-71be-8630-60af5e21f2c2",
            status: "captured",
            amount: createdTopUpFiatMinor,
            currency: "RUB",
            external_id: createdTopUpId,
            metadata: {
              vault_top_up_id: createdTopUpId,
            },
          }],
          total: 1,
          page_size: 5,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url.pathname === "/api/v1/create-order") {
        if (typeof init?.body !== "string") throw new Error("Expected SIH create-order body");
        const body = JSON.parse(init.body) as Record<string, unknown>;
        providerRequests.push({ body, path: url.pathname });
        skinCustomId = typeof body.customId === "string" ? body.customId : null;
        expect(new Headers(init.headers).get("apikey")).toBe("test-sih-commerce-smoke");
        expect(body).toMatchObject({
          amount: 1.011,
          appId: 730,
          item: commerceSmokeMarketHashName,
          steamId: steamId64,
          test: true,
          token: "tradeToken",
        });
        return Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url.pathname === "/api/v1/get-order") {
        providerRequests.push({ body: null, path: url.pathname });
        expect(url.searchParams.get("customId")).toBe(skinCustomId);
        if (skinCustomId === null) throw new Error("Skin order custom id is missing");
        return Promise.resolve(new Response(JSON.stringify({
          order: {
            amount: 1.011,
            customId: skinCustomId,
            expectedAmount: 1.011,
            id: 42,
            item: commerceSmokeMarketHashName,
            sender: { offerId: 123456 },
            status: "finished",
            steamId: steamId64,
          },
          success: true,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url.pathname === "/p/api/v1.0/steam/check") {
        if (typeof init?.body !== "string") throw new Error("Expected SIH steam check body");
        const body = JSON.parse(init.body) as unknown;
        providerRequests.push({ body, path: url.pathname });
        expect(new Headers(init.headers).get("api-key")).toBe("test-sih-commerce-smoke");
        return Promise.resolve(new Response(JSON.stringify({
          message: "Steam account found successfully",
          success: true,
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      if (url.pathname === "/p/api/v1.0/steam/pay") {
        if (typeof init?.body !== "string") throw new Error("Expected SIH steam pay body");
        const body = JSON.parse(init.body) as unknown;
        providerRequests.push({ body, path: url.pathname });
        expect(new Headers(init.headers).get("api-key")).toBe("test-sih-commerce-smoke");
        return Promise.resolve(new Response(JSON.stringify({
          cashback: 0,
          message: "Payment completed successfully",
          paymentAmount: 500,
          status: "success",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }

      return Promise.resolve(new Response(JSON.stringify({ error: `unexpected ${url.href}` }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }));
    };

    app = await createApp();
    users = app.get(UsersService);
    sessions = app.get(SessionsService);
    payments = app.get(PaymentsService);
    fulfillment = app.get(FulfillmentService);

    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-29T10:00:00Znonce",
      steamId64,
    });
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    const session = await sessions.createSession(userId, null);
    const sessionCookie = `${CUSTOMER_SESSION_COOKIE}=${session.token}`;
    const csrfToken = sessions.createCsrfToken(session.token);

    const topUp = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", sessionCookie)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "commerce-smoke-top-up")
      .send({ coinAmountMinor: 500_000 })
      .expect(200);
    const topUpBody = topUpSessionResponse(topUp.body);
    expect(topUpBody).toMatchObject({
      coinAmountMinor: 500_000,
      status: "checkout_pending",
      checkoutUrl: "https://checkout.arcpay.space/sessions/019fad28",
    });

    await expect(payments.reconcilePendingTopUps({ limit: 5 })).resolves.toEqual({
      checked: 1,
      credited: 1,
      errors: 0,
      failed: 0,
      ignored: 0,
      manualReview: 0,
      unmatched: 0,
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put(`/cart/items/${commerceSmokeSkinSlug}`)
      .set("Cookie", sessionCookie)
      .set("x-csrf-token", csrfToken)
      .send({ quantity: 1 })
      .expect(200);
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put("/cart/items/steam-top-up-500-rub")
      .set("Cookie", sessionCookie)
      .set("x-csrf-token", csrfToken)
      .send({ quantity: 1, recipient: { steamLogin: "vault_sandbox_user" } })
      .expect(200);

    const checkout = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/checkout/cart")
      .set("Cookie", sessionCookie)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "commerce-smoke-checkout")
      .send({ acceptedTotalCoinMinor: 393_000 })
      .expect(201);
    const checkoutBody = checkoutResponse(checkout.body);
    expect(checkoutBody.totalCoinMinor).toBeGreaterThan(0);
    const expectedRemainingCoinMinor = topUpBody.coinAmountMinor - checkoutBody.totalCoinMinor;

    await expect(fulfillment.processNextPendingCommand({ skinTestMode: true })).resolves.toMatchObject({
      providerOrderId: "42",
      status: "submitted",
    });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/admin/operations/fulfillment/reconcile")
      .set("x-admin-token", "vault-commerce-smoke-admin-token")
      .set("idempotency-key", "commerce-smoke-admin-fulfillment")
      .send({ reason: "commerce smoke skin reconciliation", limit: 5 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "processed",
          result: {
            checked: 1,
            errors: 0,
            reconciled: 1,
          },
        });
      });
    await expect(fulfillment.processNextPendingCommand({ skinTestMode: true })).resolves.toMatchObject({
      providerOrderId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
      status: "completed",
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/wallet/me")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          postedCoinMinor: expectedRemainingCoinMinor,
          heldCoinMinor: 0,
          availableCoinMinor: expectedRemainingCoinMinor,
        });
      });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/wallet/me/transactions")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect(({ body }) => {
        const transactions = arrayField(body as unknown, "transactions").map((transaction) => {
          const record = requireRecord(transaction);
          return {
            direction: record.direction,
            reason: record.reason,
          };
        });
        expect(transactions).toEqual([
          { direction: "debit", reason: "purchase" },
          { direction: "credit", reason: "top_up" },
        ]);
      });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/orders/me")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect(({ body }) => {
        const orders = arrayField(body as unknown, "orders").map(requireRecord);
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({
          id: checkoutBody.id,
          status: "fulfilled",
          totalCoinMinor: checkoutBody.totalCoinMinor,
        });
        const lines = arrayField(orders[0], "lines").map(requireRecord);
        expect(lines.map((line) => line.productSlug)).toEqual([
          commerceSmokeSkinSlug,
          "steam-top-up-500-rub",
        ]);
      });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/inventory/me")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect(({ body }) => {
        const items = arrayField(body as unknown, "items").map(requireRecord);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
          orderId: checkoutBody.id,
          productSlug: commerceSmokeSkinSlug,
          status: "owned",
          actions: {
            sellToSite: { enabled: false, reason: "not_supported" },
            withdrawToSteam: { enabled: true, reason: "available" },
          },
        });
      });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get("/fulfillment/me/trades")
      .set("Cookie", sessionCookie)
      .expect(200)
      .expect(({ body }) => {
        const events = arrayField(body as unknown, "events").map(requireRecord);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          direction: "purchase",
          status: "completed",
          title: "Desert Eagle | Printstream",
        });
      });

    const persisted = await pool.query<{
      command_statuses: string[];
      hold_status: string;
      line_statuses: string[];
      order_status: string;
      payment_attempts: string;
      provider_operations: string[];
      top_up_status: string;
    }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE id = $1) AS top_up_status,
          (SELECT count(*) FROM payment_provider_attempts WHERE top_up_payment_id = $1)::text AS payment_attempts,
          (SELECT status FROM orders WHERE id = $2) AS order_status,
          (SELECT status FROM wallet_holds WHERE order_id = $2) AS hold_status,
          (SELECT array_agg(status ORDER BY line_index) FROM order_lines WHERE order_id = $2) AS line_statuses,
          (SELECT array_agg(status ORDER BY command_type) FROM fulfillment_commands WHERE order_id = $2) AS command_statuses,
          (SELECT array_agg(operation ORDER BY created_at, operation) FROM fulfillment_provider_attempts WHERE order_id = $2) AS provider_operations
      `,
      [topUpBody.id, checkoutBody.id],
    );
    expect(persisted.rows[0]).toEqual({
      command_statuses: ["completed", "completed"],
      hold_status: "captured",
      line_statuses: ["supplier_finished", "supplier_finished"],
      order_status: "fulfilled",
      payment_attempts: "2",
      provider_operations: ["create_order", "get_order", "steam_check", "steam_pay"],
      top_up_status: "paid",
    });
    expect(providerRequests.map((entry) => entry.path)).toEqual([
      "/v1/checkout/sessions",
      `/v1/payments?search=${topUpBody.id}&page_size=5`,
      "/api/v1/create-order",
      "/api/v1/get-order",
      "/p/api/v1.0/steam/check",
      "/p/api/v1.0/steam/pay",
    ]);
    expect(JSON.stringify(providerRequests)).not.toContain("sk_test_commerce_smoke");
  });
});
