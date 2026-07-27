import { getInventoryItems, normalizeSteamTradeUrl } from "./account.ts";
import type { AccountSnapshot } from "./marketplace-state.ts";
import type { CoinTransaction, TradeEvent } from "../types/account.ts";

type ActionResult = { ok: true; snapshot: AccountSnapshot } | { ok: false; reason: string };

function nextSnapshot(snapshot: AccountSnapshot, event: TradeEvent, transaction?: CoinTransaction): AccountSnapshot {
  return {
    ...snapshot,
    balanceCoins: transaction?.balanceAfterCoins ?? snapshot.balanceCoins,
    transactions: transaction ? [transaction, ...snapshot.transactions] : snapshot.transactions,
    tradeEvents: [event, ...snapshot.tradeEvents],
  };
}

function sourceItem(snapshot: AccountSnapshot, itemId: string) {
  const item = getInventoryItems(snapshot.orders, snapshot.tradeEvents).find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const purchase = snapshot.tradeEvents.find((event) => event.direction === "purchase" && event.itemId === itemId && event.orderNumber === item.orderNumber && event.status === "completed");
  return purchase ? { item, purchase } : null;
}

export function sellInventoryItem(snapshot: AccountSnapshot, itemId: string, createdAt = new Date().toISOString()): ActionResult {
  const source = sourceItem(snapshot, itemId);
  if (!source) return { ok: false, reason: "Предмет уже обработан или не найден в инвентаре." };
  const balanceAfterCoins = snapshot.balanceCoins + source.item.priceCoins;
  const event: TradeEvent = { id: `sale-${source.item.id}`, createdAt, direction: "sale", title: source.item.title, itemId: source.item.id, orderNumber: source.item.orderNumber, status: "completed" };
  const transaction: CoinTransaction = { id: `sale-coins-${source.item.id}`, createdAt, direction: "credit", reason: "sale", amountCoins: source.item.priceCoins, balanceAfterCoins, status: "completed", orderNumber: source.item.orderNumber, description: `Продажа «${source.item.title}» сайту`, isDemo: true };
  return { ok: true, snapshot: nextSnapshot(snapshot, event, transaction) };
}

export function withdrawInventoryItem(snapshot: AccountSnapshot, itemId: string, tradeUrl: string, createdAt = new Date().toISOString()): ActionResult {
  const source = sourceItem(snapshot, itemId);
  if (!source) return { ok: false, reason: "Предмет уже обработан или не найден в инвентаре." };
  const normalized = normalizeSteamTradeUrl(tradeUrl);
  if (!normalized) return { ok: false, reason: "Укажите корректный Steam Trade URL перед выводом." };
  const event: TradeEvent = { id: `withdrawal-${source.item.id}`, createdAt, direction: "withdrawal", title: source.item.title, itemId: source.item.id, orderNumber: source.item.orderNumber, status: "processing" };
  return { ok: true, snapshot: nextSnapshot(snapshot, event) };
}
