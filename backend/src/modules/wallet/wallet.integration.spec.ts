import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
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
});
