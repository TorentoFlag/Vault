import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { CheckoutService } from "../checkout/checkout.service";
import { UsersService } from "../users/users.service";
import { WalletService } from "../wallet/wallet.service";
import { FulfillmentService } from "./fulfillment.service";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const userId = "user_76561198000000002";
const steamId64 = "76561198000000002";

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("fulfillment provider attempts", () => {
  const originalFetch = globalThis.fetch;
  let app: INestApplication | null = null;
  let pool: Pool;
  let checkout: CheckoutService;
  let fulfillment: FulfillmentService;
  let wallet: WalletService;
  let users: UsersService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const tempDir = await mkdtemp(join(tmpdir(), "vault-sih-fulfillment-"));
    const apiKeyFile = join(tempDir, "api-key");
    await writeFile(apiKeyFile, "test-sih-secret-key\n", { mode: 0o600 });
    process.env.SIH_API_KEY_FILE = apiKeyFile;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await pool.query("DELETE FROM supplier_listings WHERE supplier = 'sih' AND game = 'cs2' AND market_hash_name = 'Desert Eagle | Printstream (Minimal Wear)'");
    await pool.query("DELETE FROM catalog_sync_runs WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");
    delete process.env.DATABASE_URL;
    delete process.env.SIH_API_KEY_FILE;
    await app?.close();
    await pool.end();
  });

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    await pool.query(`
      TRUNCATE
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
      "UPDATE catalog_products SET price_coin_minor = 318000 WHERE slug = 'desert-eagle-printstream'",
    );
    await pool.query(`
      INSERT INTO catalog_sync_runs (id, source, game, status, observed_at, finished_at, row_count, metadata)
      VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sih', 'cs2', 'promoted', '2026-07-29T08:00:00.000Z', '2026-07-29T08:00:01.000Z', 1, '{"test":"fulfillment"}'::jsonb)
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
      VALUES ('sih', 'cs2', 'Desert Eagle | Printstream (Minimal Wear)', true, 3, 1011000, NULL, '{}'::jsonb, '2026-07-29T08:00:00.000Z', '2026-07-29T08:00:00.000Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      ON CONFLICT (supplier, game, market_hash_name) DO UPDATE
      SET active = EXCLUDED.active,
          available_quantity = EXCLUDED.available_quantity,
          price_microusd = EXCLUDED.price_microusd,
          last_sync_run_id = EXCLUDED.last_sync_run_id,
          last_seen_at = EXCLUDED.last_seen_at
    `);
    const currentApp = await createApp();
    app = currentApp;
    checkout = currentApp.get(CheckoutService);
    fulfillment = currentApp.get(FulfillmentService);
    wallet = currentApp.get(WalletService);
    users = currentApp.get(UsersService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-29T08:00:00Znonce",
      steamId64,
    });
  });

  it("persists a provider attempt before submitting a skin purchase to SIH", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-submit",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-submit",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    const providerRequests: Array<{ apiKey: string | null; body: unknown; path: string }> = [];
    globalThis.fetch = async (input, init) => {
      const attemptsBeforeProviderResponse = await pool.query<{ status: string; operation: string }>(
        "SELECT status, operation FROM fulfillment_provider_attempts WHERE order_id = $1",
        [order.id],
      );
      expect(attemptsBeforeProviderResponse.rows).toEqual([{ operation: "create_order", status: "started" }]);
      if (typeof init?.body !== "string") throw new Error("Expected SIH JSON body");
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      const parsedBody: unknown = JSON.parse(init.body);
      providerRequests.push({
        apiKey: new Headers(init.headers).get("apikey"),
        body: parsedBody,
        path: url.pathname,
      });
      return new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const result = await fulfillment.processNextPendingCommand({ skinTestMode: true });

    expect(result.status).toBe("submitted");
    if (result.status !== "submitted") throw new Error("Expected submitted fulfillment result");
    expect(result.commandId).toEqual(expect.any(String));
    expect(result.providerOrderId).toBe("42");
    expect(providerRequests).toHaveLength(1);
    const providerRequest = providerRequests[0];
    if (providerRequest === undefined) throw new Error("Expected SIH provider request");
    expect(providerRequest.apiKey).toBe("test-sih-secret-key");
    expect(providerRequest.path).toBe("/api/v1/create-order");
    const requestBody = providerRequest.body as {
      amount?: unknown;
      appId?: unknown;
      customId?: unknown;
      item?: unknown;
      steamId?: unknown;
      test?: unknown;
      token?: unknown;
    };
    expect(requestBody).toMatchObject({
      amount: 1.011,
      appId: 730,
      item: "Desert Eagle | Printstream (Minimal Wear)",
      steamId: steamId64,
      test: true,
      token: "tradeToken",
    });
    const customId = requestBody.customId;
    expect(customId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));

    const persisted = await pool.query<{
      command_status: string;
      line_status: string;
      attempt_status: string;
      operation: string;
      provider_order_id: string | null;
      request_snapshot: Record<string, unknown>;
      response_snapshot: Record<string, unknown>;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          order_lines.status AS line_status,
          fulfillment_provider_attempts.status AS attempt_status,
          fulfillment_provider_attempts.operation,
          fulfillment_provider_attempts.provider_order_id,
          fulfillment_provider_attempts.request_snapshot,
          fulfillment_provider_attempts.response_snapshot
        FROM fulfillment_provider_attempts
        JOIN fulfillment_commands ON fulfillment_commands.id = fulfillment_provider_attempts.command_id
        JOIN order_lines ON order_lines.id = fulfillment_provider_attempts.order_line_id
        WHERE fulfillment_provider_attempts.order_id = $1
      `,
      [order.id],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      attempt_status: "succeeded",
      command_status: "submitted",
      line_status: "supplier_submitted",
      operation: "create_order",
      provider_order_id: "42",
      request_snapshot: {
        amountMicrousd: "1011000",
        marketHashName: "Desert Eagle | Printstream (Minimal Wear)",
        skinTestMode: true,
      },
      response_snapshot: {
        projection: "create_acknowledgement",
        providerOrderId: "42",
      },
    });
    expect(JSON.stringify(persisted.rows)).not.toContain("tradeToken");
  });
});
