import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiProblemError,
  apiPaths,
  buildApiUrl,
  createApiClient,
  isApiUser,
} from "./api.ts";

test("frontend API transport is constrained to backend OpenAPI paths", () => {
  assert.deepEqual(apiPaths, [
    "/session/me",
    "/session/csrf",
    "/session/logout",
    "/me/steam-trade-url",
    "/me/steam-trade-url/status",
    "/wallet/me",
    "/catalog",
    "/catalog/{slug}",
    "/cart",
    "/cart/items/{productSlug}",
    "/checkout",
    "/checkout/cart",
    "/orders/me",
    "/payments/top-up/sessions",
  ]);
});

test("buildApiUrl keeps API calls same-origin by default and accepts configured origins", () => {
  assert.equal(buildApiUrl("/session/me").toString(), "http://localhost/session/me");
  assert.equal(
    buildApiUrl("/session/me", "https://api.vault.example/base").toString(),
    "https://api.vault.example/session/me",
  );
});

test("API client sends credentials and CSRF for state-changing requests", async () => {
  const calls: RequestInit[] = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    csrfToken: () => "csrf-token",
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await client.putSteamTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=1&token=a");
  assert.deepEqual(result, { configured: true });
  assert.equal(calls[0]?.credentials, "include");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
});

test("API client raises Problem errors without leaking response parsing details", async () => {
  const client = createApiClient({
    fetch: async () => new Response(JSON.stringify({
      code: "UNAUTHORIZED",
      detail: "Sign in with Steam.",
      status: 401,
      title: "Unauthorized",
      type: "https://vault.local/problems/unauthorized",
      requestId: "req_1",
    }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.getCurrentUser(),
    (error) => error instanceof ApiProblemError && error.problem.code === "UNAUTHORIZED",
  );
});

test("isApiUser accepts backend Steam identity and rejects leaked Trade URL payloads", () => {
  assert.equal(isApiUser({
    id: "user_76561198000000001",
    steam: { connected: true, steamId64: "76561198000000001" },
  }), true);
  assert.equal(isApiUser({
    id: "user_76561198000000001",
    steam: { connected: true, steamId64: "76561198000000001" },
    tradeCredential: { token: "secret" },
  }), false);
});

test("API client maps backend wallet balance from Coins minor units", async () => {
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async () => new Response(JSON.stringify({
      postedCoinMinor: 100_000,
      heldCoinMinor: 32_100,
      availableCoinMinor: 67_900,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.deepEqual(await client.getWalletBalance(), {
    postedCoins: 1000,
    heldCoins: 321,
    availableCoins: 679,
  });
});

test("API client maps backend order history without exposing internal request fields", async () => {
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async () => new Response(JSON.stringify({
      orders: [
        {
          id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
          userId: "user_76561198000000002",
          status: "held",
          totalCoinMinor: 318_000,
          createdAt: "2026-07-28T08:00:00.000Z",
          recipientSnapshots: [
            { kind: "steam-trade", steamId64: "76561198000000002", steamTradePartnerAccountId: "39734273" },
          ],
          lines: [
            {
              id: "81e734db-4db8-4862-b160-d2e4b74f2d55",
              productSlug: "desert-eagle-printstream",
              kind: "skins",
              title: "Desert Eagle | Printstream",
              quantity: 1,
              unitPriceCoinMinor: 318_000,
              recipientSnapshot: { kind: "steam-trade", steamId64: "76561198000000002", steamTradePartnerAccountId: "39734273" },
            },
          ],
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.deepEqual(await client.getOrderHistory(), [{
    id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
    number: "VLT-2FDB9DE9",
    createdAt: "2026-07-28T08:00:00.000Z",
    totalCoins: 3180,
    status: "processing",
    isDemo: false,
    items: [{
      id: "81e734db-4db8-4862-b160-d2e4b74f2d55",
      productId: "desert-eagle-printstream",
      slug: "desert-eagle-printstream",
      title: "Desert Eagle | Printstream",
      kind: "skins",
      priceCoins: 3180,
      fulfillmentMode: "steam-trade",
      deliveryStatus: "pending",
    }],
  }]);
});

test("API client creates top-up sessions with idempotency and maps provider-disabled status", async () => {
  const calls: RequestInit[] = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    csrfToken: () => "csrf-token",
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        id: "368b8584-a88d-4798-8df7-2a8568f0711d",
        userId: "user_76561198000000004",
        status: "provider_configuration_required",
        provider: "arc_pay",
        coinAmountMinor: 150_000,
        fiatAmountMinor: 100_000,
        fiatCurrency: "RUB",
        rate: { fiatMinor: 100, coinMinor: 150 },
        checkoutUrl: null,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await assert.deepEqual(await client.createTopUpSession({
    coinAmountMinor: 150_000,
    idempotencyKey: "topup-session-client",
  }), {
    id: "368b8584-a88d-4798-8df7-2a8568f0711d",
    status: "provider_configuration_required",
    provider: "arc_pay",
    coinAmountMinor: 150_000,
    fiatAmountMinor: 100_000,
    fiatCurrency: "RUB",
    rate: { fiatMinor: 100, coinMinor: 150 },
    userId: "user_76561198000000004",
    checkoutUrl: null,
  });
  assert.equal(calls[0]?.method, "POST");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
  assert.equal((calls[0]?.headers as Record<string, string>)["idempotency-key"], "topup-session-client");
  assert.equal(calls[0]?.body, JSON.stringify({ coinAmountMinor: 150_000 }));
});
