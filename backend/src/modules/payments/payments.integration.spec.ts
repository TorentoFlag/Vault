import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { CUSTOMER_SESSION_COOKIE } from "../sessions/session-cookies";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { WalletService } from "../wallet/wallet.service";

const databaseUrl = process.env.VAULT_TEST_DATABASE_URL;
const userId = "user_76561198000000004";
const steamId64 = "76561198000000004";

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("payments PostgreSQL persistence", () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let sessions: SessionsService;
  let users: UsersService;
  let wallet: WalletService;

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
        payment_webhook_events,
        payment_provider_attempts,
        top_up_payments,
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
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:00:00Znonce",
      steamId64,
    });
  });

  it("creates an idempotent top-up intent with immutable displayed terms without crediting Coins", async () => {
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const first = await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-1500")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);

    const firstBody = first.body as { id: string };
    expect(firstBody).toMatchObject({
      status: "provider_configuration_required",
      userId,
      coinAmountMinor: 150_000,
      fiatAmountMinor: 100_000,
      fiatCurrency: "RUB",
      rate: {
        fiatMinor: 100,
        coinMinor: 150,
      },
      provider: "arc_pay",
      checkoutUrl: null,
    });

    const second = await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-1500")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);

    const secondBody = second.body as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
    await request(app?.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-1500")
      .send({ coinAmountMinor: 300_000 })
      .expect(409);

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 0,
      heldCoinMinor: 0,
      availableCoinMinor: 0,
    });

    const persisted = await pool.query<{
      payments: string;
      attempts: string;
      webhook_events: string;
      coin_amount_minor: number;
      fiat_amount_minor: number;
      status: string;
    }>(
      `
        SELECT
          (SELECT count(*) FROM top_up_payments WHERE user_id = $1) AS payments,
          (SELECT count(*) FROM payment_provider_attempts WHERE top_up_payment_id = $2) AS attempts,
          (SELECT count(*) FROM payment_webhook_events) AS webhook_events,
          coin_amount_minor,
          fiat_amount_minor,
          status
        FROM top_up_payments
        WHERE id = $2
      `,
      [userId, firstBody.id],
    );
    expect(persisted.rows[0]).toEqual({
      payments: "1",
      attempts: "1",
      webhook_events: "0",
      coin_amount_minor: 150_000,
      fiat_amount_minor: 100_000,
      status: "provider_configuration_required",
    });
  });
});
