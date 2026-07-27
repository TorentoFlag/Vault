import type { Product } from "../types/commerce";
import type { CoinTransaction, InventoryItem, MarketplaceOrder, OrderItemSnapshot, OrderStatus, TradeEvent } from "../types/account";
import type { FulfillmentInput } from "./fulfillment.ts";

type RecordOptions = {
  id?: string;
  transactionId?: string;
  number?: string;
  createdAt?: string;
  status?: OrderStatus;
  fulfillment?: FulfillmentInput;
  steamTradeUrl?: string;
};

type OrderRecipient = NonNullable<MarketplaceOrder["recipient"]>;

let recordSequence = 0;

function createRecordId(prefix: string, createdAt: string) {
  recordSequence += 1;
  return `${prefix}-${Date.parse(createdAt).toString(36)}-${recordSequence.toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isOrderItem(value: unknown): value is OrderItemSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.productId === "string" && value.productId.trim().length > 0 &&
    typeof value.slug === "string" && value.slug.trim().length > 0 &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    (value.kind === "skins" || value.kind === "steam" || value.kind === "gpt") &&
    typeof value.priceCoins === "number" &&
    Number.isSafeInteger(value.priceCoins) &&
    value.priceCoins >= 0 &&
    (value.fulfillmentMode === "automatic" || value.fulfillmentMode === "steam-trade" || value.fulfillmentMode === "manual") &&
    (value.deliveryStatus === "delivered" || value.deliveryStatus === "inventory-ready" || value.deliveryStatus === "pending") &&
    (value.image === undefined || typeof value.image === "string") &&
    (value.imageAlt === undefined || typeof value.imageAlt === "string")
  );
}

function isMarketplaceOrder(value: unknown): value is MarketplaceOrder {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.number === "string" && value.number.trim().length > 0 &&
    isIsoDate(value.createdAt) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(isOrderItem) &&
    typeof value.totalCoins === "number" &&
    Number.isSafeInteger(value.totalCoins) &&
    value.totalCoins >= 0 &&
    (value.status === "completed" || value.status === "processing" || value.status === "cancelled") &&
    typeof value.isDemo === "boolean" &&
    (value.recipient === undefined || (
      isRecord(value.recipient) &&
      (value.recipient.steamLogin === undefined || typeof value.recipient.steamLogin === "string") &&
      (value.recipient.gptEmail === undefined || typeof value.recipient.gptEmail === "string") &&
      (value.recipient.steamTradeUrl === undefined || typeof value.recipient.steamTradeUrl === "string")
    ))
  );
}

function isCoinTransaction(value: unknown): value is CoinTransaction {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && value.id.trim().length > 0 &&
    isIsoDate(value.createdAt) &&
    (value.direction === "credit" || value.direction === "debit") &&
    (value.reason === "top-up" || value.reason === "purchase" || value.reason === "sale") &&
    typeof value.amountCoins === "number" &&
    Number.isSafeInteger(value.amountCoins) &&
    value.amountCoins > 0 &&
    typeof value.balanceAfterCoins === "number" &&
    Number.isSafeInteger(value.balanceAfterCoins) &&
    value.balanceAfterCoins >= 0 &&
    (value.status === "completed" || value.status === "failed") &&
    (value.orderNumber === undefined || typeof value.orderNumber === "string") &&
    typeof value.description === "string" && value.description.trim().length > 0 &&
    typeof value.isDemo === "boolean"
  );
}

export function getRelevantOrderRecipient(
  items: Array<Pick<OrderItemSnapshot, "kind">>,
  recipient?: OrderRecipient,
): OrderRecipient | undefined {
  if (!recipient) return undefined;
  const hasSteamTopUp = items.some((item) => item.kind === "steam");
  const hasSkin = items.some((item) => item.kind === "skins");
  const hasGpt = items.some((item) => item.kind === "gpt");
  const normalized: OrderRecipient = {
    ...(hasSteamTopUp && recipient.steamLogin?.trim() ? { steamLogin: recipient.steamLogin.trim() } : {}),
    ...(hasGpt && recipient.gptEmail?.trim() ? { gptEmail: recipient.gptEmail.trim().toLocaleLowerCase("ru-RU") } : {}),
    ...(hasSkin && normalizeSteamTradeUrl(recipient.steamTradeUrl)
      ? { steamTradeUrl: normalizeSteamTradeUrl(recipient.steamTradeUrl) }
      : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

export function createCheckoutRecords(products: Product[], balanceAfterCoins: number, options: RecordOptions = {}): { order: MarketplaceOrder; transaction: CoinTransaction } {
  if (!products.length) throw new Error("Checkout requires at least one product.");
  if (!Number.isSafeInteger(balanceAfterCoins) || balanceAfterCoins < 0 || products.some((product) => !Number.isSafeInteger(product.priceCoins) || product.priceCoins < 0)) {
    throw new Error("Checkout Coin values must be non-negative safe integers.");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const status = options.status ?? "processing";
  const id = options.id ?? createRecordId("order", createdAt);
  const number = options.number ?? `VLT-${id.slice(-10).toUpperCase()}`;
  const items = products.map<OrderItemSnapshot>((product, index) => ({
    id: `${id}-item-${index + 1}`,
    productId: product.id,
    slug: product.slug,
    title: product.title,
    kind: product.kind,
    priceCoins: product.priceCoins,
    fulfillmentMode: product.fulfillmentMode,
    deliveryStatus:
      status === "completed"
        ? product.kind === "skins" ? "inventory-ready" : "delivered"
        : "pending",
    image: product.image,
    imageAlt: product.imageAlt,
  }));
  const totalCoins = items.reduce((total, item) => total + item.priceCoins, 0);
  const recipient = getRelevantOrderRecipient(items, {
    steamLogin: options.fulfillment?.steamLogin,
    gptEmail: options.fulfillment?.gptEmail,
    steamTradeUrl: options.steamTradeUrl,
  });
  const order: MarketplaceOrder = {
    id,
    number,
    createdAt,
    items,
    totalCoins,
    status,
    isDemo: true,
    ...(recipient ? { recipient } : {}),
  };
  const transaction: CoinTransaction = {
    id: options.transactionId ?? createRecordId("transaction", createdAt),
    createdAt,
    direction: "debit",
    reason: "purchase",
    amountCoins: totalCoins,
    balanceAfterCoins,
    status: "completed",
    orderNumber: number,
    description: `Покупка: ${items.map((item) => item.title).join(", ")}`,
    isDemo: true,
  };
  return { order, transaction };
}

export function createTopUpTransaction(amountCoins: number, balanceAfterCoins: number, options: Pick<RecordOptions, "id" | "createdAt"> = {}): CoinTransaction {
  if (!Number.isSafeInteger(amountCoins) || amountCoins <= 0 || !Number.isSafeInteger(balanceAfterCoins) || balanceAfterCoins < 0) {
    throw new Error("Top-up amount must be positive.");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  return {
    id: options.id ?? createRecordId("top-up", createdAt),
    createdAt,
    direction: "credit",
    reason: "top-up",
    amountCoins,
    balanceAfterCoins,
    status: "completed",
    description: "Пополнение баланса Coins",
    isDemo: true,
  };
}

export function normalizeOrders(value: unknown): MarketplaceOrder[] {
  return Array.isArray(value) ? value.filter(isMarketplaceOrder).map((order) => {
    const items = order.items.map((item) => ({ ...item }));
    const recipient = getRelevantOrderRecipient(items, order.recipient);
    const normalizedOrder = { ...order, items };
    delete normalizedOrder.recipient;
    if (recipient) normalizedOrder.recipient = recipient;
    return normalizedOrder;
  }) : [];
}

export function normalizeTransactions(value: unknown): CoinTransaction[] {
  return Array.isArray(value) ? value.filter(isCoinTransaction) : [];
}

export function sortOrdersNewestFirst(orders: MarketplaceOrder[]) {
  return [...orders].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export function sortTransactionsNewestFirst(transactions: CoinTransaction[]) {
  return [...transactions].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}

export function getOverviewTransactions(transactions: CoinTransaction[], limit = 3) {
  return sortTransactionsNewestFirst(transactions).slice(0, Math.max(0, limit)).map((transaction) => ({
    transaction,
    direction: transaction.status === "failed"
      ? "neutral" as const
      : transaction.direction,
    amountLabel: transaction.status === "failed"
      ? "Баланс не изменён"
      : `${transaction.direction === "credit" ? "+" : "−"}${transaction.amountCoins.toLocaleString("ru-RU")} Coins`,
  }));
}

export function getInventoryItems(orders: MarketplaceOrder[], tradeEvents: TradeEvent[] = []): InventoryItem[] {
  const disposedItemIds = new Set(tradeEvents.filter((event) => event.direction === "sale" || event.direction === "withdrawal").map((event) => event.itemId).filter((id): id is string => Boolean(id)));
  return sortOrdersNewestFirst(orders).flatMap((order) =>
    order.status === "completed"
      ? order.items
          .filter((item) => item.kind === "skins" && item.deliveryStatus === "inventory-ready" && !disposedItemIds.has(item.id))
          .map((item) => ({
            ...item,
            orderId: order.id,
            orderNumber: order.number,
            acquiredAt: order.createdAt,
          }))
      : [],
  );
}

export function getInventoryPreviewItems(orders: MarketplaceOrder[]): OrderItemSnapshot[] {
  return getInventoryItems(orders);
}

export function getTransactionStatusLabel(transaction: Pick<CoinTransaction, "status" | "direction">) {
  if (transaction.status === "failed") return "Не выполнено";
  return transaction.direction === "credit" ? "Зачислено" : "Списано";
}

export function getOrderItemDeliveryStatusLabel(status: OrderItemSnapshot["deliveryStatus"]) {
  if (status === "delivered") return "Отмечено выполненным в локальной истории";
  if (status === "inventory-ready") return "Сохранено в локальном инвентаре";
  return "Внешняя выдача не подключена";
}

export function getTradeStatusLabel(status: TradeEvent["status"]) {
  return status === "completed" ? "Локальная запись завершена" : "Внешний трейд не запущен";
}

export function validateSteamTradeUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Укажите Steam Trade URL.";

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return "Проверьте формат Steam Trade URL.";
  }

  if (url.protocol !== "https:") return "Steam Trade URL должен начинаться с https://.";
  if (url.hostname !== "steamcommunity.com") return "Используйте ссылку с домена steamcommunity.com.";
  if (url.pathname !== "/tradeoffer/new/") return "Проверьте формат Steam Trade URL.";
  if (!/^\d+$/.test(url.searchParams.get("partner") ?? "")) return "В Steam Trade URL отсутствует корректный partner.";
  if (!/^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get("token") ?? "")) return "В Steam Trade URL отсутствует корректный token.";
  return "";
}

export function normalizeSteamTradeUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return validateSteamTradeUrl(normalized) ? "" : normalized;
}
