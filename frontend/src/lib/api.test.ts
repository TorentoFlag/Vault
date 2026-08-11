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
    "/auth/email/challenges",
    "/auth/email/challenges/{challengeId}/verify",
    "/me/steam-trade-url",
    "/me/steam-trade-url/status",
    "/wallet/me",
    "/wallet/me/transactions",
    "/catalog",
    "/catalog/{slug}",
    "/cart",
    "/cart/items/{productSlug}",
    "/checkout",
    "/checkout/cart",
    "/orders/me",
    "/inventory/me",
    "/inventory/me/items/{itemId}/withdrawals",
    "/fulfillment/me/trades",
    "/payments/top-up/sessions",
    "/digital-goods/me",
  ]);
});

test("buildApiUrl keeps API calls same-origin by default and accepts configured origins", () => {
  assert.equal(buildApiUrl("/session/me").toString(), "http://localhost/session/me");
  assert.equal(
    buildApiUrl("/session/me", "https://api.vault.example/base").toString(),
    "https://api.vault.example/session/me",
  );
});

test("API client uses configured backend origin by default", async () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.vault.example/base";
  try {
    const requestedUrls: string[] = [];
    const client = createApiClient({
      fetch: async (input) => {
        requestedUrls.push(input.toString());
        return new Response(JSON.stringify({
          id: "user_76561198000000001",
          steam: { connected: true, steamId64: "76561198000000001" },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.getCurrentUser();

    assert.deepEqual(requestedUrls, ["https://api.vault.example/session/me"]);
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = original;
    }
  }
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

test("API client maps backend wallet transaction history without internal metadata", async () => {
  const requestedUrls: string[] = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async (input) => {
      requestedUrls.push(input.toString());
      return new Response(JSON.stringify({
        transactions: [
          {
            amountCoinMinor: 35_000,
            balanceAfterCoinMinor: 65_000,
            createdAt: "2026-07-29T09:00:00.000Z",
            direction: "debit",
            id: "6aee3572-5c0b-4ba8-9dd9-488a2786c8f2",
            orderId: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
            reason: "purchase",
            status: "completed",
          },
          {
            amountCoinMinor: 100_000,
            balanceAfterCoinMinor: 100_000,
            createdAt: "2026-07-29T08:00:00.000Z",
            direction: "credit",
            id: "cc86858e-4f16-44e6-bc51-15634d83bf73",
            reason: "top_up",
            status: "completed",
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(await client.getWalletTransactions(), [
    {
      amountCoins: 350,
      balanceAfterCoins: 650,
      createdAt: "2026-07-29T09:00:00.000Z",
      description: "Покупка VLT-2FDB9DE9",
      direction: "debit",
      id: "6aee3572-5c0b-4ba8-9dd9-488a2786c8f2",
      isDemo: false,
      orderNumber: "VLT-2FDB9DE9",
      reason: "purchase",
      status: "completed",
    },
    {
      amountCoins: 1000,
      balanceAfterCoins: 1000,
      createdAt: "2026-07-29T08:00:00.000Z",
      description: "Пополнение баланса Coins",
      direction: "credit",
      id: "cc86858e-4f16-44e6-bc51-15634d83bf73",
      isDemo: false,
      reason: "top-up",
      status: "completed",
    },
  ]);
  assert.deepEqual(requestedUrls, ["https://api.vault.example/wallet/me/transactions"]);
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
          fulfillmentStage: "pending",
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

test("API client maps backend fulfillment order statuses into account history states", async () => {
  const baseOrder = {
    id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
    userId: "user_76561198000000002",
    totalCoinMinor: 318_000,
    createdAt: "2026-07-28T08:00:00.000Z",
    recipientSnapshots: [
      { kind: "steam-trade", steamId64: "76561198000000002", steamTradePartnerAccountId: "39734273" },
    ],
    lines: [
      {
        id: "81e734db-4db8-4862-b160-d2e4b74f2d55",
        fulfillmentStage: "pending",
        productSlug: "desert-eagle-printstream",
        kind: "skins",
        title: "Desert Eagle | Printstream",
        quantity: 1,
        unitPriceCoinMinor: 318_000,
        recipientSnapshot: { kind: "steam-trade", steamId64: "76561198000000002", steamTradePartnerAccountId: "39734273" },
      },
    ],
  };
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async () => new Response(JSON.stringify({
      orders: [
        { ...baseOrder, id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde", status: "fulfilled" },
        { ...baseOrder, id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcdf", status: "failed" },
        { ...baseOrder, id: "2fdb9de9-df14-4c16-82cc-7c8396e2fce0", status: "manual_review" },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  const history = await client.getOrderHistory();

  assert.deepEqual(history.map((order) => ({
    deliveryStatus: order.items[0]?.deliveryStatus,
    status: order.status,
  })), [
    { deliveryStatus: "delivered", status: "completed" },
    { deliveryStatus: "failed", status: "failed" },
    { deliveryStatus: "needs-review", status: "needs_review" },
  ]);
});

test("API client maps accepted Steam trades awaiting SIH protection into a specific delivery state", async () => {
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async () => new Response(JSON.stringify({
      orders: [
        {
          id: "926042c4-7a3a-4a62-b978-7b3caf46553e",
          userId: "user_76561198000000002",
          status: "held",
          totalCoinMinor: 3_100,
          createdAt: "2026-08-01T13:22:34.261Z",
          recipientSnapshots: [
            { kind: "steam-trade", steamId64: "76561198000000002", steamTradePartnerAccountId: "39734273" },
          ],
          lines: [
            {
              id: "77b31961-303a-43b5-9a0f-02f2b855949a",
              fulfillmentStage: "trade_protection",
              productSlug: "stattrak-aug-trigger-discipline-battle-scarred",
              kind: "skins",
              title: "StatTrak™ AUG | Стрелковая дисциплина (Закалённое в боях)",
              quantity: 1,
              unitPriceCoinMinor: 3_100,
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

  const [order] = await client.getOrderHistory();

  assert.equal(order?.status, "processing");
  assert.equal(order?.items[0]?.deliveryStatus, "trade-protection");
});

test("API client maps backend inventory projection with disabled provider-backed actions", async () => {
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async () => new Response(JSON.stringify({
      items: [
        {
          actions: {
            sellToSite: { enabled: false, reason: "not_supported" },
            withdrawToSteam: { enabled: true, reason: "available" },
          },
          acquiredAt: "2026-07-29T09:10:00.000Z",
          id: "81e734db-4db8-4862-b160-d2e4b74f2d55",
          orderId: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
          productSlug: "desert-eagle-printstream",
          status: "owned",
          title: "Desert Eagle | Printstream",
          unitPriceCoinMinor: 318_000,
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.deepEqual(await client.getInventory(), [
    {
      actions: {
        sellToSite: { enabled: false, reason: "not_supported" },
        withdrawToSteam: { enabled: true, reason: "available" },
      },
      acquiredAt: "2026-07-29T09:10:00.000Z",
      id: "81e734db-4db8-4862-b160-d2e4b74f2d55",
      orderId: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
      priceCoins: 3180,
      productId: "desert-eagle-printstream",
      slug: "desert-eagle-printstream",
      status: "owned",
      title: "Desert Eagle | Printstream",
    },
  ]);
});

test("API client maps backend fulfillment trade history without provider snapshots", async () => {
  const requestedUrls: string[] = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    fetch: async (input) => {
      requestedUrls.push(input.toString());
      return new Response(JSON.stringify({
        events: [
          {
            createdAt: "2026-07-29T09:22:00.000Z",
            direction: "purchase",
            id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
            itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
            orderNumber: "VLT-11111111",
            status: "trade_protection",
            title: "AK-47 | Redline",
          },
          {
            createdAt: "2026-07-29T09:23:00.000Z",
            direction: "withdrawal",
            id: "4ff3ccbb-4cc4-4d12-8d3a-39d9da9f8f02",
            itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
            orderNumber: "VLT-11111111",
            status: "pending",
            title: "AK-47 | Redline",
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(await client.getFulfillmentTradeHistory(), [
    {
      createdAt: "2026-07-29T09:22:00.000Z",
      direction: "purchase",
      id: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
      itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
      orderNumber: "VLT-11111111",
      status: "trade-protection",
      title: "AK-47 | Redline",
    },
    {
      createdAt: "2026-07-29T09:23:00.000Z",
      direction: "withdrawal",
      id: "4ff3ccbb-4cc4-4d12-8d3a-39d9da9f8f02",
      itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
      orderNumber: "VLT-11111111",
      status: "pending",
      title: "AK-47 | Redline",
    },
  ]);
  assert.deepEqual(requestedUrls, ["https://api.vault.example/fulfillment/me/trades"]);
});

test("API client creates backend inventory withdrawal requests with idempotency", async () => {
  const calls: Array<{ init?: RequestInit; url: string }> = [];
  const client = createApiClient({
    baseUrl: "https://api.vault.example",
    csrfToken: () => "csrf-token",
    fetch: async (input, init) => {
      calls.push({ url: input.toString(), init });
      return new Response(JSON.stringify({
        createdAt: "2026-07-29T09:23:00.000Z",
        id: "4ff3ccbb-4cc4-4d12-8d3a-39d9da9f8f02",
        itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
        orderId: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
        orderNumber: "VLT-11111111",
        status: "pending",
        title: "AK-47 | Redline",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(await client.createInventoryWithdrawal({
    idempotencyKey: "withdraw-client-test",
    itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
  }), {
    createdAt: "2026-07-29T09:23:00.000Z",
    id: "4ff3ccbb-4cc4-4d12-8d3a-39d9da9f8f02",
    itemId: "81e734db-4db8-4862-b160-d2e4b74f2d55",
    orderId: "2fdb9de9-df14-4c16-82cc-7c8396e2fcde",
    orderNumber: "VLT-11111111",
    status: "pending",
    title: "AK-47 | Redline",
  });
  assert.equal(calls[0]?.url, "https://api.vault.example/inventory/me/items/81e734db-4db8-4862-b160-d2e4b74f2d55/withdrawals");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["idempotency-key"], "withdraw-client-test");
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

test("API client accepts checkout-pending top-up sessions with backend checkout URL", async () => {
  const client = createApiClient({
    fetch: async () => new Response(JSON.stringify({
      id: "368b8584-a88d-4798-8df7-2a8568f0711d",
      userId: "user_76561198000000004",
      status: "checkout_pending",
      provider: "arc_pay",
      coinAmountMinor: 150_000,
      fiatAmountMinor: 100_000,
      fiatCurrency: "RUB",
      rate: { fiatMinor: 100, coinMinor: 150 },
      checkoutUrl: "https://pay.example/checkout/session_1",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.deepEqual(await client.createTopUpSession({
    coinAmountMinor: 150_000,
    idempotencyKey: "topup-session-checkout",
  }), {
    id: "368b8584-a88d-4798-8df7-2a8568f0711d",
    status: "checkout_pending",
    provider: "arc_pay",
    coinAmountMinor: 150_000,
    fiatAmountMinor: 100_000,
    fiatCurrency: "RUB",
    rate: { fiatMinor: 100, coinMinor: 150 },
    userId: "user_76561198000000004",
    checkoutUrl: "https://pay.example/checkout/session_1",
  });
});

test("API client accepts manual-review top-up sessions without exposing provider dispute details", async () => {
  const client = createApiClient({
    fetch: async () => new Response(JSON.stringify({
      id: "368b8584-a88d-4798-8df7-2a8568f0711d",
      userId: "user_76561198000000004",
      status: "manual_review",
      provider: "arc_pay",
      coinAmountMinor: 150_000,
      fiatAmountMinor: 100_000,
      fiatCurrency: "RUB",
      rate: { fiatMinor: 100, coinMinor: 150 },
      checkoutUrl: null,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.deepEqual(await client.createTopUpSession({
    coinAmountMinor: 150_000,
    idempotencyKey: "topup-session-manual-review",
  }), {
    id: "368b8584-a88d-4798-8df7-2a8568f0711d",
    status: "manual_review",
    provider: "arc_pay",
    coinAmountMinor: 150_000,
    fiatAmountMinor: 100_000,
    fiatCurrency: "RUB",
    rate: { fiatMinor: 100, coinMinor: 150 },
    userId: "user_76561198000000004",
    checkoutUrl: null,
  });
});
