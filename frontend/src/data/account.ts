import { catalogProducts } from "./products.ts";
import { createCheckoutRecords, createTopUpTransaction } from "../lib/account.ts";

function product(id: string) {
  const result = catalogProducts.find((item) => item.id === id);
  if (!result) throw new Error(`Unknown demo product: ${id}`);
  return result;
}

const steamOrder = createCheckoutRecords([product("steam-top-up-1000")], 10_500, {
  id: "demo-order-steam",
  transactionId: "demo-transaction-steam",
  number: "VLT-260705-1842",
  createdAt: "2026-07-05T12:42:00.000Z",
  status: "completed",
  fulfillment: { steamLogin: "vault_player", gptEmail: "" },
});

const skinOrder = createCheckoutRecords([product("ak-redline")], 7_660, {
  id: "demo-order-skin",
  transactionId: "demo-transaction-skin",
  number: "VLT-260712-4178",
  createdAt: "2026-07-12T08:18:00.000Z",
  status: "completed",
  steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12",
});

const gptOrder = createCheckoutRecords([product("gpt-plus")], 3_460, {
  id: "demo-order-gpt",
  transactionId: "demo-transaction-gpt",
  number: "VLT-260714-6391",
  createdAt: "2026-07-14T15:06:00.000Z",
  status: "processing",
  fulfillment: { steamLogin: "", gptEmail: "vault.player@example.com" },
});

export const demoOrders = [gptOrder.order, skinOrder.order, steamOrder.order];

export const demoTransactions = [
  gptOrder.transaction,
  skinOrder.transaction,
  steamOrder.transaction,
  createTopUpTransaction(12_000, 12_000, {
    id: "demo-transaction-top-up",
    createdAt: "2026-07-01T09:30:00.000Z",
  }),
  createTopUpTransaction(9_040, 12_500, {
    id: "verification-transaction-top-up-latest",
    createdAt: "2026-07-15T09:30:00.000Z",
  }),
];
