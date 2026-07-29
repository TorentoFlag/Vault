import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutServerCart,
  fetchHydratedCart,
  mapApiCart,
  removeServerCartItem,
  setServerCartItem,
} from "./cart-api.ts";

const apiCart = {
  items: [
    {
      productId: "deagle-printstream",
      productSlug: "desert-eagle-printstream",
      kind: "skins",
      title: "Desert Eagle | Printstream",
      quantity: 1,
      unitPriceCoinMinor: 18_100,
      lineTotalCoinMinor: 18_100,
      recipient: {},
    },
  ],
  totalCoinMinor: 18_100,
};

const apiCatalogProduct = {
  id: "deagle-printstream",
  slug: "desert-eagle-printstream",
  kind: "skins",
  category: "Игровые предметы",
  game: "CS2",
  productType: "Пистолет",
  title: "Desert Eagle | Printstream",
  description: "Backend catalog detail.",
  price: {
    currency: "COINS",
    amountMinor: 17_500,
    scale: 2,
    display: "175 Coins",
  },
  availability: "available",
  fulfillmentMode: "steam-trade",
  createdAt: "2026-06-25T10:00:00.000Z",
  popularity: 91,
  image: "/products/deagle-printstream.png",
  imageAlt: "Desert Eagle Printstream из Counter-Strike 2",
  meta: ["CS2", "Minimal Wear"],
  keywords: ["пистолет"],
  details: {
    specifications: [{ label: "Игра", value: "Counter-Strike 2" }],
    fulfillment: {
      title: "Steam Trade",
      description: "Trade delivery.",
      requirements: ["Steam session required."],
    },
  },
};

test("mapApiCart validates backend cart shape and converts Coins minor totals", () => {
  const cart = mapApiCart(apiCart);

  assert.equal(cart.totalCoins, 181);
  assert.equal(cart.items[0]?.productSlug, "desert-eagle-printstream");
  assert.equal(cart.items[0]?.unitPriceCoins, 181);
  assert.equal(cart.items[0]?.lineTotalCoins, 181);
  assert.throws(() => mapApiCart({ ...apiCart, totalCoinMinor: 1.5 }), /Cart response is malformed/);
});

test("fetchHydratedCart uses backend cart quote price over catalog detail price", async () => {
  const requested: string[] = [];
  const cart = await fetchHydratedCart({
    baseUrl: "https://api.vault.example",
    fetch: async (input) => {
      requested.push(String(input));
      if (String(input).endsWith("/cart")) {
        return jsonResponse(apiCart);
      }
      return jsonResponse(apiCatalogProduct);
    },
  });

  assert.deepEqual(requested, [
    "https://api.vault.example/cart",
    "https://api.vault.example/catalog/desert-eagle-printstream",
  ]);
  assert.equal(cart.products[0]?.priceCoins, 181);
  assert.equal(cart.products[0]?.isMock, undefined);
  assert.equal(cart.totalCoins, 181);
});

test("setServerCartItem sends credentials, CSRF token and sanitized recipient", async () => {
  const calls: Array<{ input: string; init: RequestInit }> = [];
  await setServerCartItem("steam-top-up-500-rub", {
    quantity: 1,
    recipient: { steamLogin: "  player_one  " },
  }, {
    baseUrl: "https://api.vault.example",
    csrfToken: () => "csrf-token",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init: init ?? {} });
      if (String(input).endsWith("/cart/items/steam-top-up-500-rub")) return jsonResponse(apiCart);
      return jsonResponse(apiCatalogProduct);
    },
  });

  assert.equal(calls[0]?.input, "https://api.vault.example/cart/items/steam-top-up-500-rub");
  assert.equal(calls[0]?.init.method, "PUT");
  assert.equal(calls[0]?.init.credentials, "include");
  assert.equal((calls[0]?.init.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
  assert.equal(calls[0]?.init.body, JSON.stringify({ quantity: 1, recipient: { steamLogin: "player_one" } }));
});

test("removeServerCartItem sends DELETE with CSRF credentials", async () => {
  const calls: RequestInit[] = [];
  await removeServerCartItem("desert-eagle-printstream", {
    csrfToken: () => "csrf-token",
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return jsonResponse({ items: [], totalCoinMinor: 0 });
    },
  });

  assert.equal(calls[0]?.method, "DELETE");
  assert.equal(calls[0]?.credentials, "include");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
});

test("checkoutServerCart posts idempotency key and returns held order totals", async () => {
  const calls: RequestInit[] = [];
  const result = await checkoutServerCart({
    idempotencyKey: "checkout-123",
    acceptedTotalCoinMinor: 18_100,
  }, {
    csrfToken: () => "csrf-token",
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return jsonResponse({
        id: "4dd6abc3-47cc-4094-ac5e-99bd5bfe0c33",
        userId: "user_76561198000000001",
        status: "held",
        totalCoinMinor: 18_100,
        recipientSnapshots: [],
        lines: [{ productId: "deagle-printstream" }],
      }, 201);
    },
  });

  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.credentials, "include");
  assert.equal((calls[0]?.headers as Record<string, string>)["idempotency-key"], "checkout-123");
  assert.equal((calls[0]?.headers as Record<string, string>)["x-csrf-token"], "csrf-token");
  assert.equal(calls[0]?.body, JSON.stringify({ acceptedTotalCoinMinor: 18_100 }));
  assert.deepEqual(result, {
    id: "4dd6abc3-47cc-4094-ac5e-99bd5bfe0c33",
    userId: "user_76561198000000001",
    status: "held",
    totalCoins: 181,
    itemCount: 1,
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
