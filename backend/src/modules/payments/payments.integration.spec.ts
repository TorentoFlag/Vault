import { createHmac } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const fakeWebhookSecret = "local-fake-arc-pay-webhook-secret";

type CreatedTopUpResponse = {
  id: string;
  checkoutUrl: string;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function fakeWebhookSignature(payload: unknown): string {
  return createHmac("sha256", fakeWebhookSecret).update(stableJson(payload), "utf8").digest("hex");
}

function requireCreatedTopUpResponse(value: unknown): CreatedTopUpResponse {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { checkoutUrl?: unknown }).checkoutUrl === "string"
  ) {
    return value as CreatedTopUpResponse;
  }
  throw new Error("Unexpected top-up response shape");
}

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
  let tempDir: string | null = null;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ARC_PAY_PROVIDER_MODE;
    delete process.env.ARC_PAY_FAKE_CHECKOUT_BASE_URL;
    delete process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE;
    await app?.close();
    await pool.end();
    if (tempDir !== null) await rm(tempDir, { recursive: true, force: true });
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

  it("credits Coins only from a verified captured fake Arc Pay webhook and deduplicates retries", async () => {
    await app?.close();
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-"));
    const secretFile = join(tempDir, "webhook-secret");
    await writeFile(secretFile, fakeWebhookSecret, "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "fake";
    process.env.ARC_PAY_FAKE_CHECKOUT_BASE_URL = "http://localhost:3999";
    process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE = secretFile;
    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:05:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-fake-1500")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);

    const createdBody = requireCreatedTopUpResponse(created.body);
    expect(created.body).toMatchObject({
      status: "checkout_pending",
      provider: "arc_pay",
      coinAmountMinor: 150_000,
      fiatAmountMinor: 100_000,
    });
    expect(createdBody.checkoutUrl).toContain("http://localhost:3999/checkout/fake_arc_pay_");
    expect(createdBody.checkoutUrl).toContain(createdBody.id);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 0,
      heldCoinMinor: 0,
      availableCoinMinor: 0,
    });

    const providerSession = await pool.query<{ provider_session_id: string }>(
      "SELECT provider_session_id FROM top_up_payments WHERE id = $1",
      [createdBody.id],
    );
    const webhookPayload = {
      eventId: "evt_fake_arc_pay_1500_captured",
      type: "payment.captured",
      checkoutSessionId: providerSession.rows[0]?.provider_session_id,
      status: "captured",
      amount: 100_000,
      currency: "RUB",
    };

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("webhook-id", webhookPayload.eventId)
      .set("x-arc-pay-signature", "bad-signature")
      .send(webhookPayload)
      .expect(401);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 0,
      heldCoinMinor: 0,
      availableCoinMinor: 0,
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("webhook-id", webhookPayload.eventId)
      .set("x-arc-pay-signature", fakeWebhookSignature(webhookPayload))
      .send(webhookPayload)
      .expect(200);

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 150_000,
      heldCoinMinor: 0,
      availableCoinMinor: 150_000,
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("webhook-id", webhookPayload.eventId)
      .set("x-arc-pay-signature", fakeWebhookSignature(webhookPayload))
      .send(webhookPayload)
      .expect(200);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 150_000,
      heldCoinMinor: 0,
      availableCoinMinor: 150_000,
    });

    const persisted = await pool.query<{
      payment_status: string;
      webhook_status: string;
      wallet_transactions: string;
      liability_entries: string;
    }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE id = $1) AS payment_status,
          (SELECT status FROM payment_webhook_events WHERE provider_event_id = $2) AS webhook_status,
          (SELECT count(*) FROM wallet_transactions WHERE user_id = $3 AND type = 'top_up_credit') AS wallet_transactions,
          (SELECT count(*) FROM wallet_ledger_entries WHERE account_key = 'vault:coins-liability') AS liability_entries
      `,
      [createdBody.id, webhookPayload.eventId, userId],
    );
    expect(persisted.rows[0]).toEqual({
      payment_status: "paid",
      webhook_status: "processed",
      wallet_transactions: "1",
      liability_entries: "1",
    });
  });
});
