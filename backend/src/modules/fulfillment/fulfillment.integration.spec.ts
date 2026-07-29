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
      acceptedTotalCoinMinor: 318_000,
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

  it("reconciles SIH sent status without regressing a sent line back to processing", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-reconcile",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-reconcile",
      acceptedTotalCoinMinor: 318_000,
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    await fulfillment.processNextPendingCommand({ skinTestMode: true });

    const createAttempt = await pool.query<{ id: string }>(
      "SELECT id FROM fulfillment_provider_attempts WHERE order_id = $1 AND operation = 'create_order'",
      [order.id],
    );
    const customId = createAttempt.rows[0]?.id;
    if (customId === undefined) throw new Error("Expected create-order attempt");

    const providerStatuses = ["sent", "processing"] as const;
    const providerRequests: Array<{ customId: string | null; path: string }> = [];
    globalThis.fetch = (input) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      providerRequests.push({
        customId: url.searchParams.get("customId"),
        path: url.pathname,
      });
      const status = providerStatuses[Math.min(providerRequests.length - 1, providerStatuses.length - 1)];
      return Promise.resolve(new Response(JSON.stringify({
        order: {
          amount: 1.011,
          customId,
          expectedAmount: 1.011,
          id: 42,
          item: "Desert Eagle | Printstream (Minimal Wear)",
          sender: {
            offerId: 123456,
          },
          status,
          steamId: steamId64,
        },
        success: true,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    };

    const firstReconciliation = await fulfillment.reconcileNextSubmittedSkinCommand();
    expect(firstReconciliation.status).toBe("reconciled");
    if (firstReconciliation.status !== "reconciled") throw new Error("Expected reconciled result");
    expect(firstReconciliation.commandId).toEqual(expect.any(String));
    expect(firstReconciliation.providerStatus).toBe("sent");

    const secondReconciliation = await fulfillment.reconcileNextSubmittedSkinCommand();
    expect(secondReconciliation.status).toBe("reconciled");
    if (secondReconciliation.status !== "reconciled") throw new Error("Expected reconciled result");
    expect(secondReconciliation.commandId).toEqual(expect.any(String));
    expect(secondReconciliation.providerStatus).toBe("processing");

    expect(providerRequests).toEqual([
      { customId, path: "/api/v1/get-order" },
      { customId, path: "/api/v1/get-order" },
    ]);
    const persisted = await pool.query<{
      command_status: string;
      line_status: string;
      lookup_attempts: string;
      provider_statuses: string[];
      response_snapshots: Array<Record<string, unknown>>;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          order_lines.status AS line_status,
          count(*) FILTER (WHERE fulfillment_provider_attempts.operation = 'get_order')::text AS lookup_attempts,
          array_agg(fulfillment_provider_attempts.response_snapshot ->> 'status' ORDER BY fulfillment_provider_attempts.created_at)
            FILTER (WHERE fulfillment_provider_attempts.operation = 'get_order') AS provider_statuses,
          array_agg(fulfillment_provider_attempts.response_snapshot ORDER BY fulfillment_provider_attempts.created_at)
            FILTER (WHERE fulfillment_provider_attempts.operation = 'get_order') AS response_snapshots
        FROM fulfillment_commands
        JOIN order_lines ON order_lines.id = fulfillment_commands.order_line_id
        JOIN fulfillment_provider_attempts ON fulfillment_provider_attempts.command_id = fulfillment_commands.id
        WHERE fulfillment_commands.order_id = $1
        GROUP BY fulfillment_commands.status, order_lines.status
      `,
      [order.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      command_status: "submitted",
      line_status: "supplier_sent",
      lookup_attempts: "2",
      provider_statuses: ["sent", "processing"],
    });
    expect(persisted.rows[0]?.response_snapshots[0]).toMatchObject({
      offerId: "123456",
      status: "sent",
    });
  });

  it("captures the Coins hold and completes the order when SIH marks every skin line finished", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-finished",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-finished",
      acceptedTotalCoinMinor: 318_000,
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    await fulfillment.processNextPendingCommand({ skinTestMode: true });

    const createAttempt = await pool.query<{ id: string }>(
      "SELECT id FROM fulfillment_provider_attempts WHERE order_id = $1 AND operation = 'create_order'",
      [order.id],
    );
    const customId = createAttempt.rows[0]?.id;
    if (customId === undefined) throw new Error("Expected create-order attempt");

    globalThis.fetch = (input) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toBe("/api/v1/get-order");
      expect(url.searchParams.get("customId")).toBe(customId);
      return Promise.resolve(new Response(JSON.stringify({
        order: {
          amount: 1.011,
          customId,
          expectedAmount: 1.011,
          id: 42,
          item: "Desert Eagle | Printstream (Minimal Wear)",
          sender: {
            offerId: 123456,
          },
          status: "finished",
          steamId: steamId64,
        },
        success: true,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    };

    const reconciliation = await fulfillment.reconcileNextSubmittedSkinCommand();
    expect(reconciliation.status).toBe("reconciled");
    if (reconciliation.status !== "reconciled") throw new Error("Expected reconciled result");
    expect(reconciliation.providerStatus).toBe("finished");

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000 - order.totalCoinMinor,
      heldCoinMinor: 0,
      availableCoinMinor: 500_000 - order.totalCoinMinor,
    });
    const persisted = await pool.query<{
      command_status: string;
      hold_status: string;
      line_status: string;
      order_status: string;
      settlement_entries_total: string;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          wallet_holds.status AS hold_status,
          order_lines.status AS line_status,
          orders.status AS order_status,
          (SELECT COALESCE(sum(amount_coin_minor), 0)::text
           FROM wallet_ledger_entries
           WHERE transaction_id IN (
             SELECT id
             FROM wallet_transactions
             WHERE user_id = $2
               AND idempotency_key = 'fulfillment-settle:' || $1::text
           )) AS settlement_entries_total
        FROM orders
        JOIN order_lines ON order_lines.order_id = orders.id
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
        JOIN wallet_holds ON wallet_holds.order_id = orders.id
        WHERE orders.id = $1::uuid
      `,
      [order.id, userId],
    );
    expect(persisted.rows[0]).toEqual({
      command_status: "completed",
      hold_status: "captured",
      line_status: "supplier_finished",
      order_status: "fulfilled",
      settlement_entries_total: "0",
    });
  });

  it("waits for SIH protection to finish before capturing a finished skin order", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-protection-processing",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-protection-processing",
      acceptedTotalCoinMinor: 318_000,
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    await fulfillment.processNextPendingCommand({ skinTestMode: true });

    const createAttempt = await pool.query<{ id: string }>(
      "SELECT id FROM fulfillment_provider_attempts WHERE order_id = $1 AND operation = 'create_order'",
      [order.id],
    );
    const customId = createAttempt.rows[0]?.id;
    if (customId === undefined) throw new Error("Expected create-order attempt");

    const protectionStatuses = ["processing", "finished"] as const;
    let lookupCount = 0;
    globalThis.fetch = () => {
      const protectionStatus = protectionStatuses[Math.min(lookupCount, protectionStatuses.length - 1)];
      lookupCount += 1;
      return Promise.resolve(new Response(JSON.stringify({
        order: {
          amount: 1.011,
          customId,
          expectedAmount: 1.011,
          id: 42,
          item: "Desert Eagle | Printstream (Minimal Wear)",
          protection: { status: protectionStatus },
          sender: {
            offerId: 123456,
          },
          status: "finished",
          steamId: steamId64,
        },
        success: true,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    };

    await expect(fulfillment.reconcileNextSubmittedSkinCommand()).resolves.toMatchObject({
      providerStatus: "finished",
      status: "reconciled",
    });
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000,
      heldCoinMinor: order.totalCoinMinor,
      availableCoinMinor: 500_000 - order.totalCoinMinor,
    });
    const protectedPending = await pool.query<{
      command_status: string;
      hold_status: string;
      line_status: string;
      order_status: string;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          wallet_holds.status AS hold_status,
          order_lines.status AS line_status,
          orders.status AS order_status
        FROM orders
        JOIN order_lines ON order_lines.order_id = orders.id
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
        JOIN wallet_holds ON wallet_holds.order_id = orders.id
        WHERE orders.id = $1
      `,
      [order.id],
    );
    expect(protectedPending.rows[0]).toEqual({
      command_status: "submitted",
      hold_status: "active",
      line_status: "supplier_sent",
      order_status: "held",
    });

    await expect(fulfillment.reconcileNextSubmittedSkinCommand()).resolves.toMatchObject({
      providerStatus: "finished",
      status: "reconciled",
    });
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000 - order.totalCoinMinor,
      heldCoinMinor: 0,
      availableCoinMinor: 500_000 - order.totalCoinMinor,
    });
  });

  it("holds funds for manual review when SIH protection fails after a finished skin trade", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-protection-failed",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-protection-failed",
      acceptedTotalCoinMinor: 318_000,
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    await fulfillment.processNextPendingCommand({ skinTestMode: true });

    const createAttempt = await pool.query<{ id: string }>(
      "SELECT id FROM fulfillment_provider_attempts WHERE order_id = $1 AND operation = 'create_order'",
      [order.id],
    );
    const customId = createAttempt.rows[0]?.id;
    if (customId === undefined) throw new Error("Expected create-order attempt");

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
      order: {
        amount: 1.011,
        customId,
        expectedAmount: 1.011,
        id: 42,
        item: "Desert Eagle | Printstream (Minimal Wear)",
        protection: {
          error: "rollback user",
          rollbackAmount: 1.011,
          rollbackAt: 1783468800,
          status: "failed",
        },
        sender: {
          offerId: 123456,
        },
        status: "finished",
        steamId: steamId64,
      },
      success: true,
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));

    const reconciliation = await fulfillment.reconcileNextSubmittedSkinCommand();
    expect(reconciliation.status).toBe("reconciled");
    if (reconciliation.status !== "reconciled") throw new Error("Expected reconciled result");
    expect(reconciliation.providerStatus).toBe("finished");

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000,
      heldCoinMinor: order.totalCoinMinor,
      availableCoinMinor: 500_000 - order.totalCoinMinor,
    });
    const persisted = await pool.query<{
      command_status: string;
      hold_status: string;
      last_error_code: string | null;
      line_status: string;
      order_status: string;
      protection_error: string | null;
      protection_status: string | null;
      settlement_transactions: string;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          fulfillment_commands.last_error_code,
          wallet_holds.status AS hold_status,
          order_lines.status AS line_status,
          orders.status AS order_status,
          fulfillment_provider_attempts.response_snapshot #>> '{protection,status}' AS protection_status,
          fulfillment_provider_attempts.response_snapshot #>> '{protection,error}' AS protection_error,
          (SELECT count(*)::text
           FROM wallet_transactions
           WHERE user_id = $2
             AND idempotency_key = 'fulfillment-settle:' || $1::text) AS settlement_transactions
        FROM orders
        JOIN order_lines ON order_lines.order_id = orders.id
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
        JOIN fulfillment_provider_attempts ON fulfillment_provider_attempts.command_id = fulfillment_commands.id
        JOIN wallet_holds ON wallet_holds.order_id = orders.id
        WHERE orders.id = $1::uuid
          AND fulfillment_provider_attempts.operation = 'get_order'
      `,
      [order.id, userId],
    );
    expect(persisted.rows[0]).toEqual({
      command_status: "manual_review",
      hold_status: "active",
      last_error_code: "SIH_PROTECTION_ROLLBACK_USER",
      line_status: "protection_failed",
      order_status: "manual_review",
      protection_error: "rollback user",
      protection_status: "failed",
      settlement_transactions: "0",
    });
  });

  it("releases the Coins hold without debiting the wallet when SIH marks every skin line failed", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "tradeToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-fulfillment-failed",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-fulfillment-failed",
      acceptedTotalCoinMinor: 318_000,
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true, id: 42, balance: 99.123456 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    await fulfillment.processNextPendingCommand({ skinTestMode: true });

    const createAttempt = await pool.query<{ id: string }>(
      "SELECT id FROM fulfillment_provider_attempts WHERE order_id = $1 AND operation = 'create_order'",
      [order.id],
    );
    const customId = createAttempt.rows[0]?.id;
    if (customId === undefined) throw new Error("Expected create-order attempt");

    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
      order: {
        amount: 1.011,
        customId,
        expectedAmount: 1.011,
        id: 42,
        item: "Desert Eagle | Printstream (Minimal Wear)",
        sender: null,
        status: "failed",
        steamId: steamId64,
      },
      success: true,
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));

    const reconciliation = await fulfillment.reconcileNextSubmittedSkinCommand();
    expect(reconciliation.status).toBe("reconciled");
    if (reconciliation.status !== "reconciled") throw new Error("Expected reconciled result");
    expect(reconciliation.providerStatus).toBe("failed");

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000,
      heldCoinMinor: 0,
      availableCoinMinor: 500_000,
    });
    const persisted = await pool.query<{
      command_status: string;
      hold_status: string;
      line_status: string;
      order_status: string;
      settlement_entries: string;
      settlement_transactions: string;
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          wallet_holds.status AS hold_status,
          order_lines.status AS line_status,
          orders.status AS order_status,
          (SELECT count(*)::text
           FROM wallet_ledger_entries
           WHERE transaction_id IN (
             SELECT id
             FROM wallet_transactions
             WHERE user_id = $2
               AND idempotency_key = 'fulfillment-settle:' || $1::text
           )) AS settlement_entries,
          (SELECT count(*)::text
           FROM wallet_transactions
           WHERE user_id = $2
             AND idempotency_key = 'fulfillment-settle:' || $1::text) AS settlement_transactions
        FROM orders
        JOIN order_lines ON order_lines.order_id = orders.id
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
        JOIN wallet_holds ON wallet_holds.order_id = orders.id
        WHERE orders.id = $1::uuid
      `,
      [order.id, userId],
    );
    expect(persisted.rows[0]).toEqual({
      command_status: "failed",
      hold_status: "released",
      line_status: "supplier_failed",
      order_status: "failed",
      settlement_entries: "0",
      settlement_transactions: "1",
    });
  });

  it("checks and pays a Steam refill command before capturing the Coins hold", async () => {
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-steam-refill",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-steam-refill",
      acceptedTotalCoinMinor: 75_000,
      items: [{ productSlug: "steam-top-up-500-rub", quantity: 1, recipient: { steamLogin: "vault_sandbox_user" } }],
    });

    const providerRequests: Array<{ body: unknown; path: string }> = [];
    globalThis.fetch = async (input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected SIH JSON body");
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      const body = JSON.parse(init.body) as unknown;
      providerRequests.push({ body, path: url.pathname });
      if (url.pathname.endsWith("/steam/check")) {
        const attemptsBeforeProviderResponse = await pool.query<{ operation: string; status: string }>(
          "SELECT operation, status FROM fulfillment_provider_attempts WHERE order_id = $1 ORDER BY created_at ASC",
          [order.id],
        );
        expect(attemptsBeforeProviderResponse.rows).toEqual([{ operation: "steam_check", status: "started" }]);
        return new Response(JSON.stringify({
          message: "Steam account found successfully",
          success: true,
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
      const attemptsBeforeProviderResponse = await pool.query<{ operation: string; status: string }>(
        "SELECT operation, status FROM fulfillment_provider_attempts WHERE order_id = $1 ORDER BY created_at ASC",
        [order.id],
      );
      expect(attemptsBeforeProviderResponse.rows).toEqual([
        { operation: "steam_check", status: "succeeded" },
        { operation: "steam_pay", status: "started" },
      ]);
      return new Response(JSON.stringify({
        cashback: 0,
        message: "Payment completed successfully",
        paymentAmount: 500,
        status: "success",
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const result = await fulfillment.processNextPendingCommand({ skinTestMode: true });

    expect(result.status).toBe("completed");
    expect(providerRequests).toEqual([
      { path: "/p/api/v1.0/steam/check", body: { steamUsername: "vault_sandbox_user" } },
      {
        path: "/p/api/v1.0/steam/pay",
        body: {
          amount: 500,
          currency: "RUB",
          steamUsername: "vault_sandbox_user",
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        },
      },
    ]);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 500_000 - order.totalCoinMinor,
      heldCoinMinor: 0,
      availableCoinMinor: 500_000 - order.totalCoinMinor,
    });
    const persisted = await pool.query<{
      command_status: string;
      hold_status: string;
      line_status: string;
      operations: string[];
      order_status: string;
      provider_order_ids: string[];
    }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          wallet_holds.status AS hold_status,
          order_lines.status AS line_status,
          orders.status AS order_status,
          array_agg(fulfillment_provider_attempts.operation ORDER BY fulfillment_provider_attempts.created_at) AS operations,
          array_agg(fulfillment_provider_attempts.provider_order_id ORDER BY fulfillment_provider_attempts.created_at) AS provider_order_ids
        FROM orders
        JOIN order_lines ON order_lines.order_id = orders.id
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
        JOIN fulfillment_provider_attempts ON fulfillment_provider_attempts.command_id = fulfillment_commands.id
        JOIN wallet_holds ON wallet_holds.order_id = orders.id
        WHERE orders.id = $1
        GROUP BY fulfillment_commands.status, wallet_holds.status, order_lines.status, orders.status
      `,
      [order.id],
    );
    expect(persisted.rows[0]).toEqual({
      command_status: "completed",
      hold_status: "captured",
      line_status: "supplier_finished",
      operations: ["steam_check", "steam_pay"],
      order_status: "fulfilled",
      provider_order_ids: ["d34cb700-fcf9-4cab-89b1-7a6b552a0df5", "d34cb700-fcf9-4cab-89b1-7a6b552a0df5"],
    });
    expect(JSON.stringify(persisted.rows)).not.toContain("test-sih-secret-key");
  });

  it("retries Steam refill pay with the existing SIH transaction after a pay failure", async () => {
    await wallet.creditUser({
      userId,
      amountCoinMinor: 500_000,
      idempotencyKey: "topup-credit-steam-refill-retry",
      reason: "test-credit",
    });
    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-steam-refill-retry",
      acceptedTotalCoinMinor: 75_000,
      items: [{ productSlug: "steam-top-up-500-rub", quantity: 1, recipient: { steamLogin: "vault_sandbox_user" } }],
    });

    const providerRequests: Array<{ body: unknown; path: string }> = [];
    globalThis.fetch = (input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected SIH JSON body");
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      const body = JSON.parse(init.body) as unknown;
      providerRequests.push({ body, path: url.pathname });
      if (url.pathname.endsWith("/steam/check")) {
        return Promise.resolve(new Response(JSON.stringify({
          message: "Steam account found successfully",
          success: true,
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }));
      }
      if (providerRequests.filter((requestRecord) => requestRecord.path.endsWith("/steam/pay")).length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: "temporary" }), {
          headers: { "content-type": "application/json" },
          status: 503,
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        cashback: 0,
        message: "Payment already completed",
        paymentAmount: 500,
        status: "success",
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }));
    };

    await expect(fulfillment.processNextPendingCommand({ skinTestMode: true })).rejects.toMatchObject({
      code: "SIH_PROVIDER_UNAVAILABLE",
    });
    const afterFailure = await pool.query<{ command_status: string; operations: string[]; statuses: string[] }>(
      `
        SELECT
          fulfillment_commands.status AS command_status,
          array_agg(fulfillment_provider_attempts.operation ORDER BY fulfillment_provider_attempts.created_at) AS operations,
          array_agg(fulfillment_provider_attempts.status ORDER BY fulfillment_provider_attempts.created_at) AS statuses
        FROM fulfillment_commands
        JOIN fulfillment_provider_attempts ON fulfillment_provider_attempts.command_id = fulfillment_commands.id
        WHERE fulfillment_commands.order_id = $1
        GROUP BY fulfillment_commands.status
      `,
      [order.id],
    );
    expect(afterFailure.rows[0]).toEqual({
      command_status: "pending",
      operations: ["steam_check", "steam_pay"],
      statuses: ["succeeded", "failed"],
    });

    const result = await fulfillment.processNextPendingCommand({ skinTestMode: true });

    expect(result.status).toBe("completed");
    expect(providerRequests).toEqual([
      { path: "/p/api/v1.0/steam/check", body: { steamUsername: "vault_sandbox_user" } },
      {
        path: "/p/api/v1.0/steam/pay",
        body: {
          amount: 500,
          currency: "RUB",
          steamUsername: "vault_sandbox_user",
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        },
      },
      {
        path: "/p/api/v1.0/steam/pay",
        body: {
          amount: 500,
          currency: "RUB",
          steamUsername: "vault_sandbox_user",
          transactionId: "d34cb700-fcf9-4cab-89b1-7a6b552a0df5",
        },
      },
    ]);
    const persisted = await pool.query<{ operations: string[]; statuses: string[] }>(
      `
        SELECT
          array_agg(operation ORDER BY created_at) AS operations,
          array_agg(status ORDER BY created_at) AS statuses
        FROM fulfillment_provider_attempts
        WHERE order_id = $1
      `,
      [order.id],
    );
    expect(persisted.rows[0]).toEqual({
      operations: ["steam_check", "steam_pay", "steam_pay"],
      statuses: ["succeeded", "failed", "succeeded"],
    });
  });
});
