import assert from "node:assert/strict";
import test from "node:test";

import { catalogProducts } from "../data/products.ts";
import {
  createCheckoutRecords,
  createTopUpTransaction,
  getOrderItemDeliveryStatusLabel,
  getOverviewTransactions,
  getTradeStatusLabel,
  getTransactionStatusLabel,
  getInventoryItems,
  getInventoryPreviewItems,
  normalizeOrders,
  normalizeSteamTradeUrl,
  normalizeTransactions,
  sortOrdersNewestFirst,
  validateSteamTradeUrl,
} from "./account.ts";

function getCatalogProduct(id: string) {
  const product = catalogProducts.find((item) => item.id === id);
  assert.ok(product, `Товар ${id} должен существовать`);
  return product;
}

test("checkout создаёт snapshot всех товаров и согласованное списание Coins", () => {
  const products = [getCatalogProduct("ak-redline"), getCatalogProduct("gpt-plus")];
  const result = createCheckoutRecords(products, 1_960, {
    id: "order-test",
    number: "VLT-TEST-001",
    createdAt: "2026-07-16T08:00:00.000Z",
  });

  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.totalCoins, 7_040);
  assert.deepEqual(result.order.items.map((item) => item.title), ["AK-47 | Redline", "GPT Plus"]);
  assert.equal(result.transaction.direction, "debit");
  assert.equal(result.transaction.amountCoins, 7_040);
  assert.equal(result.transaction.balanceAfterCoins, 1_960);
  assert.equal(result.transaction.orderNumber, "VLT-TEST-001");
});

test("пополнение создаёт только положительную завершённую операцию", () => {
  const transaction = createTopUpTransaction(2_500, 5_340, {
    id: "top-up-test",
    createdAt: "2026-07-16T08:05:00.000Z",
  });

  assert.equal(transaction.direction, "credit");
  assert.equal(transaction.reason, "top-up");
  assert.equal(transaction.amountCoins, 2_500);
  assert.equal(transaction.balanceAfterCoins, 5_340);
  assert.throws(() => createTopUpTransaction(0, 5_340));
});

test("нормализация истории отбрасывает повреждённые записи", () => {
  const valid = createCheckoutRecords([getCatalogProduct("ak-redline")], 0, {
    id: "order-valid",
    number: "VLT-VALID",
    createdAt: "2026-07-16T08:10:00.000Z",
  });

  assert.deepEqual(normalizeOrders([valid.order, { id: 1 }, null]), [valid.order]);
  assert.deepEqual(normalizeTransactions([valid.transaction, { amountCoins: -1 }]), [valid.transaction]);
  assert.deepEqual(normalizeOrders("broken"), []);
  assert.deepEqual(normalizeTransactions(null), []);
});

test("заказы сортируются по дате без изменения исходного массива", () => {
  const older = createCheckoutRecords([getCatalogProduct("steam-top-up-500")], 0, {
    id: "older",
    number: "VLT-OLDER",
    createdAt: "2026-07-10T08:00:00.000Z",
  }).order;
  const newer = createCheckoutRecords([getCatalogProduct("gpt-plus")], 0, {
    id: "newer",
    number: "VLT-NEWER",
    createdAt: "2026-07-15T08:00:00.000Z",
  }).order;
  const source = [older, newer];

  assert.deepEqual(sortOrdersNewestFirst(source).map((order) => order.id), ["newer", "older"]);
  assert.deepEqual(source.map((order) => order.id), ["older", "newer"]);
});

test("preview инвентаря содержит только завершённые игровые предметы", () => {
  const ready = createCheckoutRecords([getCatalogProduct("ak-redline")], 0, {
    id: "ready",
    number: "VLT-READY",
    createdAt: "2026-07-15T08:00:00.000Z",
    status: "completed",
  }).order;
  const digital = createCheckoutRecords([getCatalogProduct("gpt-plus")], 0, {
    id: "digital",
    number: "VLT-DIGITAL",
    createdAt: "2026-07-15T09:00:00.000Z",
    status: "completed",
  }).order;
  const pending = createCheckoutRecords([getCatalogProduct("awp-asiimov")], 0, {
    id: "pending",
    number: "VLT-PENDING",
    createdAt: "2026-07-15T10:00:00.000Z",
  }).order;

  assert.deepEqual(getInventoryPreviewItems([ready, digital, pending]).map((item) => item.productId), ["ak-redline"]);
});

test("полный инвентарь сохраняет заказ, дату и повторные покупки одного товара", () => {
  const first = createCheckoutRecords([getCatalogProduct("ak-redline")], 0, {
    id: "inventory-first",
    number: "VLT-INVENTORY-1",
    createdAt: "2026-07-12T08:00:00.000Z",
    status: "completed",
  }).order;
  const second = createCheckoutRecords([getCatalogProduct("ak-redline")], 0, {
    id: "inventory-second",
    number: "VLT-INVENTORY-2",
    createdAt: "2026-07-15T08:00:00.000Z",
    status: "completed",
  }).order;

  const items = getInventoryItems([first, second]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.orderNumber), ["VLT-INVENTORY-2", "VLT-INVENTORY-1"]);
  assert.equal(items[0].orderId, "inventory-second");
  assert.equal(items[0].acquiredAt, "2026-07-15T08:00:00.000Z");
  assert.equal(items[0].productId, items[1].productId);
  assert.notEqual(items[0].id, items[1].id);
});

test("Steam Trade URL принимает только официальный tradeoffer URL", () => {
  assert.equal(validateSteamTradeUrl(""), "Укажите Steam Trade URL.");
  assert.equal(
    validateSteamTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x"),
    "",
  );
  assert.match(validateSteamTradeUrl("http://steamcommunity.com/tradeoffer/new/?partner=1&token=abcdef"), /https/);
  assert.match(validateSteamTradeUrl("https://example.com/tradeoffer/new/?partner=1&token=abcdef"), /steamcommunity\.com/);
  assert.match(validateSteamTradeUrl("https://steamcommunity.com/id/user"), /формат/);
});

test("failed Coins operations are labelled as failed rather than credited or debited", () => {
  assert.equal(getTransactionStatusLabel({ status: "failed", direction: "credit" }), "Не выполнено");
  assert.equal(getTransactionStatusLabel({ status: "failed", direction: "debit" }), "Не выполнено");
  assert.equal(getTransactionStatusLabel({ status: "completed", direction: "credit" }), "Зачислено");
  assert.equal(getTransactionStatusLabel({ status: "completed", direction: "debit" }), "Списано");
});

test("overview operations are newest-first and failed rows state that balance did not change", () => {
  const older = createTopUpTransaction(500, 500, { id: "older-operation", createdAt: "2026-07-10T08:00:00.000Z" });
  const failed = {
    ...createTopUpTransaction(900, 500, { id: "failed-operation", createdAt: "2026-07-17T08:00:00.000Z" }),
    status: "failed" as const,
  };
  const overview = getOverviewTransactions([older, failed]);

  assert.deepEqual(overview.map((item) => item.transaction.id), ["failed-operation", "older-operation"]);
  assert.equal(overview[0].amountLabel, "Баланс не изменён");
  assert.equal(overview[0].direction, "neutral");
  assert.equal(overview[1].amountLabel, "+500 Coins");
});

test("order and trade statuses describe local records without promising external fulfillment", () => {
  assert.equal(getOrderItemDeliveryStatusLabel("delivered"), "Отмечено выполненным в локальной истории");
  assert.equal(getOrderItemDeliveryStatusLabel("inventory-ready"), "Сохранено в локальном инвентаре");
  assert.equal(getOrderItemDeliveryStatusLabel("pending"), "Внешняя выдача не подключена");
  assert.equal(getTradeStatusLabel("completed"), "Локальная запись завершена");
  assert.equal(getTradeStatusLabel("processing"), "Внешний трейд не запущен");
  assert.equal(getTradeStatusLabel("pending"), "Внешний трейд не запущен");
});

test("повреждённый Trade URL из localStorage сбрасывается", () => {
  const valid = "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x";
  assert.equal(normalizeSteamTradeUrl(valid), valid);
  assert.equal(normalizeSteamTradeUrl("https://example.com/tradeoffer/new/?partner=1&token=abcdef"), "");
  assert.equal(normalizeSteamTradeUrl(42), "");
});

test("checkout snapshots normalized Steam Trade URL into an immutable order recipient", () => {
  const tradeUrl = "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x";
  const records = createCheckoutRecords([getCatalogProduct("ak-redline")], 4_000, {
    id: "trade-url-order",
    createdAt: "2026-07-17T08:00:00.000Z",
    fulfillment: { steamLogin: " VaultPlayer ", gptEmail: "" },
    steamTradeUrl: `  ${tradeUrl}  `,
  });

  assert.equal(records.order.recipient?.steamTradeUrl, tradeUrl);
  const normalized = normalizeOrders([records.order]);
  assert.equal(normalized[0]?.recipient?.steamTradeUrl, tradeUrl);
});

test("order recipient snapshots only fields required by its product kinds and preserves mixed carts", () => {
  const tradeUrl = "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x";
  const fulfillment = { steamLogin: "VaultPlayer", gptEmail: "linked-audit@example.com" };
  const create = (productIds: string[]) => createCheckoutRecords(
    productIds.map(getCatalogProduct),
    10_000,
    { fulfillment, steamTradeUrl: tradeUrl },
  ).order;

  const skinOnly = create(["ak-redline"]);
  assert.deepEqual(skinOnly.recipient, { steamTradeUrl: tradeUrl });

  const steamOnly = create(["steam-top-up-500"]);
  assert.deepEqual(steamOnly.recipient, { steamLogin: "VaultPlayer" });

  const gptOnly = create(["gpt-plus"]);
  assert.deepEqual(gptOnly.recipient, { gptEmail: "linked-audit@example.com" });

  const mixed = create(["ak-redline", "steam-top-up-500", "gpt-plus"]);
  assert.deepEqual(mixed.recipient, {
    steamLogin: "VaultPlayer",
    gptEmail: "linked-audit@example.com",
    steamTradeUrl: tradeUrl,
  });

  const [normalizedLegacy] = normalizeOrders([{
    ...skinOnly,
    recipient: { steamLogin: "wrong", gptEmail: "wrong@example.com", steamTradeUrl: tradeUrl },
  }]);
  assert.deepEqual(normalizedLegacy.recipient, { steamTradeUrl: tradeUrl });
});
