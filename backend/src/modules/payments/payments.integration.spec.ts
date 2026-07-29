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
import { DatabaseService } from "../../common/database/database.service";
import { CUSTOMER_SESSION_COOKIE } from "../sessions/session-cookies";
import { SessionsService } from "../sessions/sessions.service";
import { UsersService } from "../users/users.service";
import { WalletService } from "../wallet/wallet.service";
import { PaymentsService } from "./payments.service";

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

function arcPayWebhookSignature(rawBody: string, eventId: string, timestamp: string, secret: string): string {
  const signature = createHmac("sha256", secret)
    .update(Buffer.concat([
      Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
      Buffer.from(rawBody, "utf8"),
    ]))
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
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

function fetchInputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe.skipIf(!databaseUrl)("payments PostgreSQL persistence", () => {
  let app: INestApplication | null = null;
  let pool: Pool;
  let sessions: SessionsService;
  let users: UsersService;
  let wallet: WalletService;
  let payments: PaymentsService;
  let tempDir: string | null = null;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
    originalFetch = globalThis.fetch;
  });

  afterAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ARC_PAY_PROVIDER_MODE;
    delete process.env.ARC_PAY_FAKE_CHECKOUT_BASE_URL;
    delete process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE;
    delete process.env.ARC_PAY_SECRET_KEY_FILE;
    delete process.env.ARC_PAY_PUBLIC_ORIGIN;
    globalThis.fetch = originalFetch;
    await app?.close();
    await pool.end();
    if (tempDir !== null) await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
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
    payments = currentApp.get(PaymentsService);
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
    app = null;
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

  it("creates a real Arc Pay hosted checkout request with SBP only without crediting Coins", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-real-"));
    const secretFile = join(tempDir, "secret-key");
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://hkdk.events/source-id";
    const providerRequests: Array<{ input: string; init: RequestInit }> = [];
    globalThis.fetch = (input, init) => {
      const requestInit: RequestInit = init ?? {};
      providerRequests.push({ input: fetchInputUrl(input), init: requestInit });
      return Promise.resolve(new Response(JSON.stringify({
        id: "019f7841-4b12-7a2f-a42b-5c3a72e3b277",
        url: "https://checkout.arcpay.space/sessions/019f7841",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    };

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:10:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-sbp-1500")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);

    expect(created.body).toMatchObject({
      status: "checkout_pending",
      provider: "arc_pay",
      coinAmountMinor: 150_000,
      fiatAmountMinor: 100_000,
      checkoutUrl: "https://checkout.arcpay.space/sessions/019f7841",
    });
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.input).toBe("https://api.arcpay.space/v1/checkout/sessions");
    expect(providerRequests[0]?.init.headers).toMatchObject({
      authorization: "Bearer sk_test_vault_real_checkout",
      "idempotency-key": (created.body as { id: string }).id,
    });
    const providerBody = providerRequests[0]?.init.body;
    if (typeof providerBody !== "string") throw new Error("Expected provider JSON body string");
    expect(JSON.parse(providerBody)).toMatchObject({
      amount: 100_000,
      capture_mode: "one_stage",
      currency: "RUB",
      external_id: (created.body as { id: string }).id,
      payment_methods: [{
        method: "sbp",
        payment_mode: "h2h",
      }],
      success_url: "https://hkdk.events/source-id/balance/top-up?payment=success",
      fail_url: "https://hkdk.events/source-id/balance/top-up?payment=failed",
      cancel_url: "https://hkdk.events/source-id/balance/top-up?payment=cancelled",
    });
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 0,
      heldCoinMinor: 0,
      availableCoinMinor: 0,
    });
  });

  it("marks a real Arc Pay top-up failed when checkout creation is rejected", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-real-failed-"));
    const secretFile = join(tempDir, "secret-key");
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://vault.example";
    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
      code: "method_not_available",
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }));

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:10:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-sbp-provider-fail")
      .send({ coinAmountMinor: 150_000 })
      .expect(503);

    const database = currentApp.get(DatabaseService);
    const persisted = await database.query<{ payment_status: string }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE user_id = $1 AND idempotency_key = $2) AS payment_status
      `,
      [userId, "topup-session-real-sbp-provider-fail"],
    );
    expect(persisted.rows[0]).toEqual({ payment_status: "failed" });

    const attempt = await database.query<{
      error_code: string;
      idempotency_key_is_uuid: boolean;
      status: string;
    }>(
      `
        SELECT
          status,
          error_code,
          idempotency_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' AS idempotency_key_is_uuid
        FROM payment_provider_attempts
        WHERE top_up_payment_id = (
          SELECT id FROM top_up_payments WHERE user_id = $1 AND idempotency_key = $2
        )
      `,
      [userId, "topup-session-real-sbp-provider-fail"],
    );
    expect(attempt.rows[0]).toEqual({
      status: "failed",
      error_code: "ARC_PAY_CHECKOUT_CREATE_FAILED",
      idempotency_key_is_uuid: true,
    });
  });

  it("credits Coins from a verified real Arc Pay captured webhook and deduplicates retries", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-real-webhook-"));
    const secretFile = join(tempDir, "secret-key");
    const webhookSecretFile = join(tempDir, "webhook-secret");
    const webhookSecret = "vault-real-webhook-secret";
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    await writeFile(webhookSecretFile, webhookSecret, "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE = webhookSecretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://hkdk.events/source-id";
    const providerCheckoutSessionId = "019f7841-4b12-7a2f-a42b-5c3a72e3b277";
    const providerPaymentId = "019facd9-9e3f-730f-9180-8a43c1499df7";
    let createdTopUpId = "";
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      if (url.endsWith(`/payments/${providerPaymentId}`)) {
        return Promise.resolve(new Response(JSON.stringify({
          id: providerPaymentId,
          status: "captured",
          amount: 100_000,
          currency: "RUB",
          external_id: createdTopUpId,
          metadata: {
            vault_top_up_id: createdTopUpId,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        id: providerCheckoutSessionId,
        url: "https://checkout.arcpay.space/sessions/019f7841",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    };

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:10:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-webhook")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);
    const createdBody = requireCreatedTopUpResponse(created.body);
    createdTopUpId = createdBody.id;
    expect(createdBody.checkoutUrl).toBe("https://checkout.arcpay.space/sessions/019f7841");

    const eventId = "019f7841-9265-7a53-82e7-39a81dd568ff";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const webhookBody = JSON.stringify({
      event_id: eventId,
      event_type: "payment.captured",
      created_at: "2026-07-28T11:20:00.000Z",
      tenant_id: "019f7841-ef75-77f1-b4bb-36f556684c5a",
      environment: "sandbox",
      livemode: false,
      data: {
        payment_id: providerPaymentId,
        amount: 100_000,
        captured_amount: 100_000,
        currency: "RUB",
        payment_method: "sbp",
      },
    });
    const signature = arcPayWebhookSignature(webhookBody, eventId, timestamp, webhookSecret);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("content-type", "application/json")
      .set("webhook-id", eventId)
      .set("webhook-timestamp", timestamp)
      .set("webhook-signature", signature)
      .send(webhookBody)
      .expect(200, { status: "processed" });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("content-type", "application/json")
      .set("webhook-id", eventId)
      .set("webhook-timestamp", timestamp)
      .set("webhook-signature", signature)
      .send(webhookBody)
      .expect(200, { status: "duplicate" });

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 150_000,
      heldCoinMinor: 0,
      availableCoinMinor: 150_000,
    });
  });

  it("marks a Hosted Checkout top-up failed from a verified real Arc Pay declined webhook", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-real-declined-"));
    const secretFile = join(tempDir, "secret-key");
    const webhookSecretFile = join(tempDir, "webhook-secret");
    const webhookSecret = "vault-real-webhook-secret";
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    await writeFile(webhookSecretFile, webhookSecret, "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE = webhookSecretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://hkdk.events/source-id";
    const providerCheckoutSessionId = "019f7841-4b12-7a2f-a42b-5c3a72e3b277";
    const providerPaymentId = "019facd9-9e3f-730f-9180-8a43c1499df7";
    let createdTopUpId = "";
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      if (url.endsWith(`/payments/${providerPaymentId}`)) {
        return Promise.resolve(new Response(JSON.stringify({
          id: providerPaymentId,
          status: "declined",
          amount: 100_000,
          currency: "RUB",
          external_id: createdTopUpId,
          metadata: {
            vault_top_up_id: createdTopUpId,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        id: providerCheckoutSessionId,
        url: "https://checkout.arcpay.space/sessions/019f7841",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    };

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:10:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-declined")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);
    const createdBody = requireCreatedTopUpResponse(created.body);
    createdTopUpId = createdBody.id;

    const eventId = "019facdb-b116-7434-b27c-debea8fb1c27";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const webhookBody = JSON.stringify({
      event_id: eventId,
      event_type: "payment.declined",
      created_at: "2026-07-28T11:20:00.000Z",
      tenant_id: "019f7841-ef75-77f1-b4bb-36f556684c5a",
      environment: "sandbox",
      livemode: false,
      data: {
        payment_id: providerPaymentId,
        amount: 100_000,
        currency: "RUB",
        decline_code: "expired_card",
      },
    });
    const signature = arcPayWebhookSignature(webhookBody, eventId, timestamp, webhookSecret);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("content-type", "application/json")
      .set("webhook-id", eventId)
      .set("webhook-timestamp", timestamp)
      .set("webhook-signature", signature)
      .send(webhookBody)
      .expect(200, { status: "processed" });

    const persisted = await pool.query<{ payment_status: string; provider_status: string; webhook_status: string }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE id = $1) AS payment_status,
          (SELECT provider_status FROM top_up_payments WHERE id = $1) AS provider_status,
          (SELECT status FROM payment_webhook_events WHERE provider_event_id = $2) AS webhook_status
      `,
      [createdBody.id, eventId],
    );
    expect(persisted.rows[0]).toEqual({
      payment_status: "failed",
      provider_status: "declined",
      webhook_status: "processed",
    });
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 0,
      heldCoinMinor: 0,
      availableCoinMinor: 0,
    });
  });

  it("moves a paid top-up to manual review on a verified Arc Pay refund without reversing wallet history", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-real-refund-"));
    const secretFile = join(tempDir, "secret-key");
    const webhookSecretFile = join(tempDir, "webhook-secret");
    const webhookSecret = "vault-real-webhook-secret";
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    await writeFile(webhookSecretFile, webhookSecret, "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE = webhookSecretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://hkdk.events/source-id";
    const providerCheckoutSessionId = "019f7841-4b12-7a2f-a42b-5c3a72e3b277";
    const providerPaymentId = "019facd9-9e3f-730f-9180-8a43c1499df7";
    let createdTopUpId = "";
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      if (url.endsWith(`/payments/${providerPaymentId}`)) {
        return Promise.resolve(new Response(JSON.stringify({
          id: providerPaymentId,
          status: "captured",
          amount: 100_000,
          currency: "RUB",
          external_id: createdTopUpId,
          metadata: {
            vault_top_up_id: createdTopUpId,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        id: providerCheckoutSessionId,
        url: "https://checkout.arcpay.space/sessions/019f7841",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    };

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:30:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-refund")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);
    const createdBody = requireCreatedTopUpResponse(created.body);
    createdTopUpId = createdBody.id;

    const capturedEventId = "019facdb-b116-7434-b27c-debea8fb1c28";
    const capturedTimestamp = String(Math.floor(Date.now() / 1000));
    const capturedBody = JSON.stringify({
      event_id: capturedEventId,
      event_type: "payment.captured",
      created_at: "2026-07-28T11:30:00.000Z",
      tenant_id: "019f7841-ef75-77f1-b4bb-36f556684c5a",
      environment: "sandbox",
      livemode: false,
      data: {
        payment_id: providerPaymentId,
        amount: 100_000,
        captured_amount: 100_000,
        currency: "RUB",
        payment_method: "sbp",
      },
    });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("content-type", "application/json")
      .set("webhook-id", capturedEventId)
      .set("webhook-timestamp", capturedTimestamp)
      .set("webhook-signature", arcPayWebhookSignature(capturedBody, capturedEventId, capturedTimestamp, webhookSecret))
      .send(capturedBody)
      .expect(200, { status: "processed" });

    const refundEventId = "019facdb-b116-7434-b27c-debea8fb1c29";
    const refundTimestamp = String(Math.floor(Date.now() / 1000));
    const refundBody = JSON.stringify({
      event_id: refundEventId,
      event_type: "payment.refunded",
      created_at: "2026-07-28T11:35:00.000Z",
      tenant_id: "019f7841-ef75-77f1-b4bb-36f556684c5a",
      environment: "sandbox",
      livemode: false,
      data: {
        payment_id: providerPaymentId,
        amount: 100_000,
        currency: "RUB",
        operation_ref_id: "refund_001",
      },
    });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/webhooks/arc-pay")
      .set("content-type", "application/json")
      .set("webhook-id", refundEventId)
      .set("webhook-timestamp", refundTimestamp)
      .set("webhook-signature", arcPayWebhookSignature(refundBody, refundEventId, refundTimestamp, webhookSecret))
      .send(refundBody)
      .expect(200, { status: "processed" });

    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 150_000,
      heldCoinMinor: 0,
      availableCoinMinor: 150_000,
    });
    const persisted = await pool.query<{
      payment_status: string;
      provider_status: string;
      review_reason: string;
      wallet_transactions: string;
      refund_webhook_status: string;
    }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE id = $1) AS payment_status,
          (SELECT provider_status FROM top_up_payments WHERE id = $1) AS provider_status,
          (SELECT metadata->>'manualReviewReason' FROM top_up_payments WHERE id = $1) AS review_reason,
          (SELECT count(*) FROM wallet_transactions WHERE user_id = $2 AND type = 'top_up_credit') AS wallet_transactions,
          (SELECT status FROM payment_webhook_events WHERE provider_event_id = $3) AS refund_webhook_status
      `,
      [createdBody.id, userId, refundEventId],
    );
    expect(persisted.rows[0]).toEqual({
      payment_status: "manual_review",
      provider_status: "refunded",
      review_reason: "arc_pay_refunded_after_credit",
      wallet_transactions: "1",
      refund_webhook_status: "processed",
    });
  });

  it("reconciles a missing Arc Pay webhook by polling payment status without double-crediting Coins", async () => {
    await app?.close();
    app = null;
    tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-reconcile-"));
    const secretFile = join(tempDir, "secret-key");
    await writeFile(secretFile, "sk_test_vault_real_checkout\n", "utf8");
    process.env.ARC_PAY_PROVIDER_MODE = "real";
    process.env.ARC_PAY_SECRET_KEY_FILE = secretFile;
    process.env.ARC_PAY_PUBLIC_ORIGIN = "https://hkdk.events/source-id";
    const providerCheckoutSessionId = "019f7841-4b12-7a2f-a42b-5c3a72e3b277";
    const providerPaymentId = "019facd9-9e3f-730f-9180-8a43c1499df7";
    let createdTopUpId = "";
    const providerRequests: string[] = [];
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      providerRequests.push(url);
      if (url.startsWith("https://api.arcpay.space/v1/payments?")) {
        return Promise.resolve(new Response(JSON.stringify({
          payments: [{
            id: providerPaymentId,
            status: "captured",
            amount: 100_000,
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
      return Promise.resolve(new Response(JSON.stringify({
        id: providerCheckoutSessionId,
        url: "https://checkout.arcpay.space/sessions/019f7841",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    };

    const currentApp = await createApp();
    app = currentApp;
    sessions = currentApp.get(SessionsService);
    users = currentApp.get(UsersService);
    wallet = currentApp.get(WalletService);
    payments = currentApp.get(PaymentsService);
    await users.upsertSteamUser({
      claimedIdentifier: `https://steamcommunity.com/openid/id/${steamId64}`,
      providerEndpoint: "https://steamcommunity.com/openid/login",
      responseNonce: "2026-07-28T11:25:00Znonce",
      steamId64,
    });
    const session = await sessions.createSession(userId, null);
    const csrfToken = sessions.createCsrfToken(session.token);

    const created = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/payments/top-up/sessions")
      .set("Cookie", `${CUSTOMER_SESSION_COOKIE}=${session.token}`)
      .set("x-csrf-token", csrfToken)
      .set("idempotency-key", "topup-session-real-reconcile")
      .send({ coinAmountMinor: 150_000 })
      .expect(200);
    const createdBody = requireCreatedTopUpResponse(created.body);
    createdTopUpId = createdBody.id;

    await expect(payments.reconcilePendingTopUps({ limit: 10 })).resolves.toEqual({
      checked: 1,
      credited: 1,
      failed: 0,
      ignored: 0,
      manualReview: 0,
      unmatched: 0,
      errors: 0,
    });
    await expect(payments.reconcilePendingTopUps({ limit: 10 })).resolves.toEqual({
      checked: 0,
      credited: 0,
      failed: 0,
      ignored: 0,
      manualReview: 0,
      unmatched: 0,
      errors: 0,
    });

    expect(providerRequests).toContain(`https://api.arcpay.space/v1/payments?search=${createdBody.id}&page_size=5`);
    await expect(wallet.getBalance(userId)).resolves.toEqual({
      postedCoinMinor: 150_000,
      heldCoinMinor: 0,
      availableCoinMinor: 150_000,
    });

    const persisted = await pool.query<{
      payment_status: string;
      provider_status: string;
      wallet_transactions: string;
      reconcile_attempts: string;
    }>(
      `
        SELECT
          (SELECT status FROM top_up_payments WHERE id = $1) AS payment_status,
          (SELECT provider_status FROM top_up_payments WHERE id = $1) AS provider_status,
          (SELECT count(*) FROM wallet_transactions WHERE user_id = $2 AND type = 'top_up_credit') AS wallet_transactions,
          (SELECT count(*) FROM payment_provider_attempts WHERE top_up_payment_id = $1 AND idempotency_key = 'reconcile:' || $1::text) AS reconcile_attempts
      `,
      [createdBody.id, userId],
    );
    expect(persisted.rows[0]).toEqual({
      payment_status: "paid",
      provider_status: "captured",
      wallet_transactions: "1",
      reconcile_attempts: "1",
    });
  });

});
