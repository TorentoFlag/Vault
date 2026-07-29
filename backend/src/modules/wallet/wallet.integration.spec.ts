import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { DatabaseService } from "../../common/database/database.service";
import { UsersService } from "../users/users.service";
import { WalletIdempotencyConflictError, WalletService } from "./wallet.service";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const userId = "user_76561198000000003";

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("wallet PostgreSQL persistence", () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let database: DatabaseService;
  let wallet: WalletService;
  let users: UsersService;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    delete process.env.DATABASE_URL;
    await app?.close();
    await pool.end();
  });

  beforeEach(async () => {
    if (app) await app.close();
    await pool.query(`
      TRUNCATE
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
    const currentApp = await createApp();
    app = currentApp;
    database = currentApp.get(DatabaseService);
    wallet = currentApp.get(WalletService);
    users = currentApp.get(UsersService);
    await users.upsertSteamUser({
      claimedIdentifier: "https://steamcommunity.com/openid/id/76561198000000003",
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T10:00:00Znonce",
      steamId64: "76561198000000003",
    });
  });

  it("rejects an idempotent credit replay with different financial terms", async () => {
    await wallet.creditUser({
      userId,
      amountCoinMinor: 100_000,
      idempotencyKey: "topup-credit-conflict",
      reason: "test-credit",
    });

    await expect(wallet.creditUser({
      userId,
      amountCoinMinor: 200_000,
      idempotencyKey: "topup-credit-conflict",
      reason: "test-credit",
    })).rejects.toBeInstanceOf(WalletIdempotencyConflictError);

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 100_000,
      heldCoinMinor: 0,
      availableCoinMinor: 100_000,
    });
  });

  it("captures or releases an active order hold with idempotent balanced settlement", async () => {
    await wallet.creditUser({
      userId,
      amountCoinMinor: 100_000,
      idempotencyKey: "topup-credit-settlement",
      reason: "test-credit",
    });
    const order = await pool.query<{ id: string }>(
      `
        INSERT INTO orders (user_id, idempotency_key, request_hash, status, total_coin_minor, recipient_snapshots)
        VALUES ($1, 'checkout-wallet-settlement', 'hash-wallet-settlement', 'held', 60_000, '[]'::jsonb)
        RETURNING id
      `,
      [userId],
    );
    const orderId = order.rows[0]?.id;
    if (orderId === undefined) throw new Error("Expected order id");
    await database.transaction(async (client) => {
      await wallet.createHold(client, {
        userId,
        orderId,
        amountCoinMinor: 60_000,
        reason: "checkout",
      });
    });

    await wallet.settleOrderHold({
      userId,
      orderId,
      captureCoinMinor: 35_000,
      idempotencyKey: "settle-wallet-partial",
      reason: "fulfillment_terminal",
    });
    await wallet.settleOrderHold({
      userId,
      orderId,
      captureCoinMinor: 35_000,
      idempotencyKey: "settle-wallet-partial",
      reason: "fulfillment_terminal",
    });

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 65_000,
      heldCoinMinor: 0,
      availableCoinMinor: 65_000,
    });
    const persisted = await pool.query<{
      customer_entries: string;
      hold_status: string;
      captured: string;
      released: string;
      settlement_entries_total: string;
      settlement_transactions: string;
    }>(
      `
        SELECT
          (SELECT count(*)
           FROM wallet_ledger_entries
           WHERE account_key = $1 AND amount_coin_minor = -35000)::text AS customer_entries,
          (SELECT status FROM wallet_holds WHERE order_id = $2) AS hold_status,
          (SELECT (captured_at IS NOT NULL)::text FROM wallet_holds WHERE order_id = $2) AS captured,
          (SELECT (released_at IS NOT NULL)::text FROM wallet_holds WHERE order_id = $2) AS released,
          (SELECT COALESCE(sum(amount_coin_minor), 0)::text
           FROM wallet_ledger_entries
           WHERE transaction_id IN (
             SELECT id
             FROM wallet_transactions
             WHERE user_id = $3 AND idempotency_key = 'settle-wallet-partial'
           )) AS settlement_entries_total,
          (SELECT count(*)::text
           FROM wallet_transactions
           WHERE user_id = $3 AND idempotency_key = 'settle-wallet-partial') AS settlement_transactions
      `,
      [`customer:${userId}`, orderId, userId],
    );
    expect(persisted.rows[0]).toEqual({
      customer_entries: "1",
      hold_status: "partially_captured",
      captured: "true",
      released: "true",
      settlement_entries_total: "0",
      settlement_transactions: "1",
    });

    await expect(wallet.settleOrderHold({
      userId,
      orderId,
      captureCoinMinor: 40_000,
      idempotencyKey: "settle-wallet-partial",
      reason: "fulfillment_terminal",
    })).rejects.toBeInstanceOf(WalletIdempotencyConflictError);

    await expect(wallet.settleOrderHold({
      userId,
      orderId,
      captureCoinMinor: 10_000,
      idempotencyKey: "settle-wallet-after-closed",
      reason: "fulfillment_terminal_retry",
    })).rejects.toThrow("WALLET_HOLD_ALREADY_SETTLED");
    const finalBalance = await wallet.getBalance(userId);
    expect(finalBalance).toEqual({
      postedCoinMinor: 65_000,
      heldCoinMinor: 0,
      availableCoinMinor: 65_000,
    });
  });
});
