import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { CUSTOMER_SESSION_COOKIE } from "../sessions/session-cookies";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { CheckoutInsufficientBalanceError, CheckoutService } from "./checkout.service";
import { WalletService } from "../wallet/wallet.service";

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

describe.skipIf(!databaseUrl)("checkout PostgreSQL persistence", () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let checkout: CheckoutService;
  let wallet: WalletService;
  let users: UsersService;
  let sessions: SessionsService;

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
    await pool.query(
      "UPDATE catalog_products SET price_coin_minor = 318000 WHERE slug = 'desert-eagle-printstream'",
    );
    const currentApp = await createApp();
    app = currentApp;
    checkout = currentApp.get(CheckoutService);
    wallet = currentApp.get(WalletService);
    users = currentApp.get(UsersService);
    sessions = currentApp.get(SessionsService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T10:00:00Znonce",
      steamId64,
    });
  });

  it("creates independent order lines and an active Coins hold from posted wallet balance", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "secretToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 636_000,
      idempotencyKey: "topup-credit-checkout-green",
      reason: "test-credit",
    });

    const order = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-skins-two-units",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 2 }],
    });

    expect(order).toMatchObject({
      userId,
      status: "held",
      totalCoinMinor: 636_000,
      lines: [
        { productSlug: "desert-eagle-printstream", quantity: 1, unitPriceCoinMinor: 318_000 },
        { productSlug: "desert-eagle-printstream", quantity: 1, unitPriceCoinMinor: 318_000 },
      ],
    });
    expect(order.recipientSnapshots).toEqual([
      {
        kind: "steam-trade",
        steamId64,
        steamTradePartnerAccountId: "39734273",
      },
    ]);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 636_000,
      heldCoinMinor: 636_000,
      availableCoinMinor: 0,
    });

    const postedTransactionBalance = await pool.query<{ balance: string }>(
      `
        SELECT COALESCE(sum(amount_coin_minor), 0)::text AS balance
        FROM wallet_ledger_entries
        WHERE transaction_id IN (
          SELECT id
          FROM wallet_transactions
          WHERE idempotency_key = 'topup-credit-checkout-green'
        )
      `,
    );
    expect(postedTransactionBalance.rows[0]?.balance).toBe("0");

    const persisted = await pool.query<{ line_count: string; hold_count: string }>(
      `
        SELECT
          (SELECT count(*) FROM order_lines WHERE order_id = $1) AS line_count,
          (SELECT count(*) FROM wallet_holds WHERE order_id = $1 AND status = 'active') AS hold_count
      `,
      [order.id],
    );
    expect(persisted.rows[0]).toEqual({ line_count: "2", hold_count: "1" });
  });

  it("does not create an order or hold when available Coins are insufficient", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "secretToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 317_999,
      idempotencyKey: "topup-credit-too-small",
      reason: "test-credit",
    });

    await expect(checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-insufficient",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    })).rejects.toBeInstanceOf(CheckoutInsufficientBalanceError);

    const persisted = await pool.query<{ orders: string; holds: string }>(
      "SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM wallet_holds) AS holds",
    );
    expect(persisted.rows[0]).toEqual({ orders: "0", holds: "0" });
  });

  it("maps insufficient Coins to a client-visible 402 response", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "secretToken" });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/checkout")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "checkout-api-insufficient")
      .send({ items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }] })
      .expect(402)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          statusCode: 402,
          code: "CHECKOUT_INSUFFICIENT_BALANCE",
        });
      });
  });

  it("rejects a malformed checkout body without creating a server error", async () => {
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/checkout")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "checkout-api-malformed")
      .send({})
      .expect(400);
  });

  it("requires a saved Steam Trade URL before skin checkout", async () => {
    await wallet.creditUser({
      userId,
      amountCoinMinor: 318_000,
      idempotencyKey: "topup-credit-no-trade-url",
      reason: "test-credit",
    });

    await expect(checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-no-trade-url",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    })).rejects.toMatchObject({ code: "STEAM_TRADE_URL_REQUIRED" });
  });

  it("returns the existing order for the same idempotency key without duplicating holds", async () => {
    await users.saveSteamTradeCredential(userId, { partner: "39734273", token: "secretToken" });
    await wallet.creditUser({
      userId,
      amountCoinMinor: 636_000,
      idempotencyKey: "topup-credit-idempotent-checkout",
      reason: "test-credit",
    });

    const first = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-idempotent",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });
    const second = await checkout.checkoutFromCart({
      userId,
      idempotencyKey: "checkout-idempotent",
      items: [{ productSlug: "desert-eagle-printstream", quantity: 1 }],
    });

    expect(second.id).toBe(first.id);
    const holds = await pool.query<{ count: string; total: string }>(
      "SELECT count(*) AS count, COALESCE(sum(amount_coin_minor), 0)::text AS total FROM wallet_holds WHERE user_id = $1",
      [userId],
    );
    expect(holds.rows[0]).toEqual({ count: "1", total: "318000" });
  });
});
