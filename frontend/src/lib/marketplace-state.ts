import { demoOrders, demoTransactions } from "../data/account.ts";
import { normalizeOrders, normalizeSteamTradeUrl, normalizeTransactions } from "./account.ts";
import { connectAuthAccount, isMarketplaceSession, validateEmail, type MarketplaceSession, type MarketplaceUser } from "./auth.ts";
import type { CoinTransaction, MarketplaceOrder, TradeEvent } from "../types/account.ts";

export type AccountSnapshot = {
  balanceCoins: number;
  orders: MarketplaceOrder[];
  transactions: CoinTransaction[];
  tradeEvents: TradeEvent[];
  steamTradeUrl: string;
  isSeedData: boolean;
};

export type PersistedMarketplaceState = {
  version: 5;
  revision: number;
  cartIds: string[];
  session: MarketplaceSession | null;
  currentAccountKey: string | null;
  accounts: Record<string, AccountSnapshot>;
  identityLinks: Record<string, MarketplaceSession>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function cloneOrders(orders: MarketplaceOrder[]) {
  return normalizeOrders(JSON.parse(JSON.stringify(orders)));
}

function cloneTransactions(transactions: CoinTransaction[]) {
  return transactions.map((transaction) => ({ ...transaction })).sort(newestFirst);
}

function uniqueById<T extends { id: string }>(values: T[], recordType: string) {
  const unique = new Map<string, T>();
  values.forEach((value) => {
    const existing = unique.get(value.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(`${recordType} id conflict: ${value.id}`);
    }
    if (!existing) unique.set(value.id, value);
  });
  return [...unique.values()];
}

function newestFirst<T extends { id: string; createdAt: string }>(left: T, right: T) {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id);
}

export function mergeAccountSnapshots(snapshots: AccountSnapshot[]): AccountSnapshot {
  const normalized = snapshots.map(normalizeAccountSnapshot);
  const steamTradeUrls = [...new Set(normalized.map((snapshot) => snapshot.steamTradeUrl).filter(Boolean))];
  if (!normalized.length) return createEmptyAccountSnapshot();
  const orders = uniqueById(normalized.flatMap((snapshot) => snapshot.orders), "Order").sort(newestFirst);
  const orderNumberIds = new Map<string, string>();
  orders.forEach((order) => {
    const existingId = orderNumberIds.get(order.number);
    if (existingId && existingId !== order.id) throw new Error(`Order number conflict: ${order.number}`);
    orderNumberIds.set(order.number, order.id);
  });
  const mergedTransactions = uniqueById(normalized.flatMap((snapshot) => snapshot.transactions), "Transaction")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  let runningBalance = 0;
  const transactions = mergedTransactions.map((transaction) => {
    if (transaction.status === "completed") {
      runningBalance += transaction.direction === "credit" ? transaction.amountCoins : -transaction.amountCoins;
      if (!Number.isSafeInteger(runningBalance) || runningBalance < 0) throw new Error("Ledger merge conflict: invalid balance continuity");
    }
    return { ...transaction, balanceAfterCoins: runningBalance };
  }).sort(newestFirst);
  const tradeEvents = uniqueById(normalized.flatMap((snapshot) => snapshot.tradeEvents), "Trade event").sort(newestFirst);

  const mergedSnapshot: AccountSnapshot = {
    balanceCoins: runningBalance,
    orders,
    transactions,
    tradeEvents,
    // Conflicting URLs must never be selected implicitly; require the user to choose again.
    steamTradeUrl: steamTradeUrls.length === 1 ? steamTradeUrls[0] : "",
    isSeedData: normalized.some((snapshot) => snapshot.isSeedData),
  };
  if (!isSemanticallyValidSnapshot(mergedSnapshot)) throw new Error("Ledger merge conflict: combined snapshot is invalid");

  return mergedSnapshot;
}

function mergeLegacyAccountSnapshots(snapshots: AccountSnapshot[]): AccountSnapshot {
  const normalized = snapshots.map(normalizeAccountSnapshot);
  const steamTradeUrls = [...new Set(normalized.map((snapshot) => snapshot.steamTradeUrl).filter(Boolean))];
  const dedupe = <T extends { id: string }>(records: T[]) => [...records.reduce((map, record) => {
    const existing = map.get(record.id);
    if (!existing || JSON.stringify(record).localeCompare(JSON.stringify(existing)) < 0) map.set(record.id, record);
    return map;
  }, new Map<string, T>()).values()];
  const transactions = dedupe(normalized.flatMap((snapshot) => snapshot.transactions)).sort(newestFirst);
  const latestCompleted = transactions.find((transaction) => transaction.status === "completed");
  return {
    balanceCoins: latestCompleted?.balanceAfterCoins ?? Math.max(0, ...normalized.map((snapshot) => snapshot.balanceCoins)),
    orders: dedupe(normalized.flatMap((snapshot) => snapshot.orders)).sort(newestFirst),
    transactions,
    tradeEvents: dedupe(normalized.flatMap((snapshot) => snapshot.tradeEvents)).sort(newestFirst),
    steamTradeUrl: steamTradeUrls.length === 1 ? steamTradeUrls[0] : "",
    isSeedData: normalized.some((snapshot) => snapshot.isSeedData),
  };
}

export function createEmptyAccountSnapshot(): AccountSnapshot {
  return { balanceCoins: 0, orders: [], transactions: [], tradeEvents: [], steamTradeUrl: "", isSeedData: false };
}

export function createSeedSteamAccountSnapshot(): AccountSnapshot {
  return {
    balanceCoins: 12_500,
    orders: cloneOrders(demoOrders),
    transactions: cloneTransactions(demoTransactions),
    tradeEvents: demoOrders.flatMap((order) => order.items
      .filter((item) => item.kind === "skins")
      .map((item) => ({
        id: `${order.id}-trade-${item.id}`,
        createdAt: order.createdAt,
        direction: "purchase" as const,
        title: item.title,
        itemId: item.id,
        orderNumber: order.number,
        status: order.status === "completed" ? "completed" as const : "pending" as const,
      }))),
    steamTradeUrl: "",
    isSeedData: true,
  };
}

export function getSessionAccountKeys(session: MarketplaceSession | null) {
  return [session?.emailAccount?.id, session?.steamAccount?.id]
    .filter((key): key is string => Boolean(key));
}

export function getSessionAccountKey(session: MarketplaceSession | null) {
  return getSessionAccountKeys(session)[0] ?? null;
}

function sessionContainsAccount(session: MarketplaceSession, accountId: string) {
  return getSessionAccountKeys(session).includes(accountId);
}

export function buildIdentityLinks(
  current: Record<string, MarketplaceSession>,
  session: MarketplaceSession | null,
) {
  if (!session) return { ...current };
  const next = { ...current };
  const keys = getSessionAccountKeys(session);
  const hasConflict = keys.some((key) => {
    const linked = next[key];
    if (!linked) return false;
    const linkedKeys = getSessionAccountKeys(linked);
    return linkedKeys.some((candidate) => !keys.includes(candidate));
  });

  if (hasConflict) {
    const standalone = [session.emailAccount, session.steamAccount].filter((account): account is MarketplaceUser => Boolean(account));
    standalone.forEach((account) => {
      if (!next[account.id]) next[account.id] = connectAuthAccount(null, account);
    });
    return next;
  }

  keys.forEach((key) => { next[key] = session; });
  return next;
}

export type AccountConnectionResult =
  | { ok: true; session: MarketplaceSession }
  | { ok: false; message: string };

export function resolveAccountConnection(
  identityLinks: Record<string, MarketplaceSession>,
  currentSession: MarketplaceSession | null,
  account: MarketplaceUser,
): AccountConnectionResult {
  const existing = identityLinks[account.id];
  if (!currentSession) {
    return { ok: true, session: restoreLinkedSession(identityLinks, account) };
  }
  if (sessionContainsAccount(currentSession, account.id)) {
    return { ok: true, session: currentSession };
  }
  const currentSameProvider = account.method === "email"
    ? currentSession.emailAccount
    : currentSession.steamAccount;
  if (currentSameProvider && currentSameProvider.id !== account.id) {
    return {
      ok: false,
      message: account.method === "steam"
        ? "Сначала выйдите из текущего Steam-профиля, чтобы войти в другой."
        : "Сначала выйдите из текущего Email-аккаунта, чтобы войти в другой.",
    };
  }
  if (existing) {
    const currentKeys = getSessionAccountKeys(currentSession);
    const existingKeys = getSessionAccountKeys(existing);
    const existingOppositeKeys = existingKeys.filter((key) => key !== account.id);
    const currentOppositeKeys = currentKeys.filter((key) => key !== account.id);
    if (existingOppositeKeys.length && currentOppositeKeys.some((key) => !existingOppositeKeys.includes(key))) {
      return {
        ok: false,
        message: account.method === "steam"
          ? "Этот Steam-профиль уже связан с другим Email-аккаунтом. Выйдите и войдите через связанный аккаунт."
          : "Этот Email уже связан с другим Steam-профилем. Выйдите и войдите через связанный аккаунт.",
      };
    }
    return existingOppositeKeys.length
      ? { ok: true, session: existing }
      : { ok: true, session: connectAuthAccount(currentSession, account) };
  }
  return { ok: true, session: connectAuthAccount(currentSession, account) };
}

export function restoreLinkedSession(
  identityLinks: Record<string, MarketplaceSession>,
  account: MarketplaceUser,
) {
  const linked = identityLinks[account.id];
  return linked && sessionContainsAccount(linked, account.id)
    ? linked
    : connectAuthAccount(null, account);
}

function snapshotHasData(snapshot: AccountSnapshot) {
  return snapshot.balanceCoins > 0
    || snapshot.orders.length > 0
    || snapshot.transactions.length > 0
    || snapshot.tradeEvents.length > 0
    || Boolean(snapshot.steamTradeUrl);
}

export function synchronizeLinkedAccountSnapshots({
  accounts,
  currentSession,
  nextSession,
  currentSnapshot,
}: {
  accounts: Record<string, AccountSnapshot>;
  currentSession: MarketplaceSession | null;
  nextSession: MarketplaceSession;
  currentSnapshot: AccountSnapshot;
}) {
  const currentKeys = getSessionAccountKeys(currentSession);
  const nextKeys = getSessionAccountKeys(nextSession);
  const isAdditiveLink = currentKeys.length > 0
    && currentKeys.every((key) => nextKeys.includes(key))
    && nextKeys.length === currentKeys.length + 1;

  if (!isAdditiveLink) {
    const nextKey = getSessionAccountKey(nextSession);
    const snapshot = nextKey
      ? accounts[nextKey] ?? initialSnapshotForSession(nextSession)
      : initialSnapshotForSession(nextSession);
    const nextAccounts = { ...accounts };
    nextKeys.forEach((key) => { nextAccounts[key] = snapshot; });
    return { accounts: nextAccounts, snapshot };
  }
  const withCurrent = { ...accounts };
  currentKeys.forEach((key) => { withCurrent[key] = currentSnapshot; });

  const initialNextSnapshot = nextSession.steamAccount
    ? createSeedSteamAccountSnapshot()
    : createEmptyAccountSnapshot();
  const candidateSnapshots = [...new Set([...currentKeys, ...nextKeys])]
    .map((key) => withCurrent[key])
    .filter((snapshot): snapshot is AccountSnapshot => Boolean(snapshot));
  if (!candidateSnapshots.includes(currentSnapshot)) candidateSnapshots.push(currentSnapshot);
  const compatibleSnapshots = candidateSnapshots.map((snapshot) => {
    const normalized = normalizeAccountSnapshot(snapshot);
    if (isSemanticallyValidSnapshot(normalized)) return normalized;
    const reconciled = reconcileUnchargedLegacyOrders(normalized);
    return isSemanticallyValidSnapshot(reconciled)
      ? reconciled
      : createLegacyCompatibleSnapshot(snapshot) ?? snapshot;
  });
  const populatedSnapshots = compatibleSnapshots.filter(snapshotHasData);
  const snapshot = mergeAccountSnapshots(populatedSnapshots.length ? populatedSnapshots : [initialNextSnapshot]);
  const linkedAccounts = { ...withCurrent };
  [...new Set([...currentKeys, ...nextKeys])].forEach((key) => {
    linkedAccounts[key] = snapshot;
  });

  return { accounts: linkedAccounts, snapshot };
}

function normalizeTradeEvents(value: unknown): TradeEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((event): event is TradeEvent => {
    if (!isRecord(event)) return false;
    return typeof event.id === "string" && event.id.trim().length > 0
      && typeof event.createdAt === "string"
      && Number.isFinite(Date.parse(event.createdAt))
      && (event.direction === "purchase" || event.direction === "sale" || event.direction === "withdrawal")
      && typeof event.title === "string" && event.title.trim().length > 0
      && (event.itemId === undefined || (typeof event.itemId === "string" && event.itemId.trim().length > 0))
      && (event.orderNumber === undefined || (typeof event.orderNumber === "string" && event.orderNumber.trim().length > 0))
      && (event.status === "completed" || event.status === "processing" || event.status === "pending");
  });
}

function isSemanticallyValidSnapshot(snapshot: AccountSnapshot) {
  const uniqueIds = <T extends { id: string }>(records: T[]) => new Set(records.map((record) => record.id)).size === records.length;
  if (!uniqueIds(snapshot.orders) || !uniqueIds(snapshot.transactions) || !uniqueIds(snapshot.tradeEvents)) return false;
  const topLevelIds = [...snapshot.orders, ...snapshot.transactions, ...snapshot.tradeEvents].map((record) => record.id);
  if (new Set(topLevelIds).size !== topLevelIds.length) return false;
  const itemIds = snapshot.orders.flatMap((order) => order.items.map((item) => item.id));
  if (new Set(itemIds).size !== itemIds.length) return false;
  const orderNumbers = new Map(snapshot.orders.map((order) => [order.number, order]));
  if (orderNumbers.size !== snapshot.orders.length) return false;
  if (snapshot.orders.some((order) => (
    !Number.isSafeInteger(order.totalCoins)
    || order.totalCoins < 0
    || order.items.some((item) => !Number.isSafeInteger(item.priceCoins) || item.priceCoins < 0)
    || order.totalCoins !== order.items.reduce((sum, item) => sum + item.priceCoins, 0)
  ))) return false;

  if (snapshot.orders.some((order) => order.items.some((item) => {
    const expectedMode = item.kind === "skins" ? "steam-trade" : item.kind === "steam" ? "automatic" : "manual";
    const expectedDelivery = order.status === "completed"
      ? item.kind === "skins" ? "inventory-ready" : "delivered"
      : "pending";
    return item.fulfillmentMode !== expectedMode || item.deliveryStatus !== expectedDelivery;
  }))) return false;

  if (snapshot.orders.some((order) => {
    if (order.status === "cancelled") return false;
    const recipient = order.recipient;
    if (order.items.some((item) => item.kind === "skins") && !normalizeSteamTradeUrl(recipient?.steamTradeUrl)) return true;
    if (order.items.some((item) => item.kind === "steam") && (recipient?.steamLogin?.trim().length ?? 0) < 3) return true;
    return order.items.some((item) => item.kind === "gpt") && Boolean(validateEmail(recipient?.gptEmail ?? ""));
  })) return false;

  if (snapshot.transactions.some((transaction) => {
    if (!Number.isSafeInteger(transaction.amountCoins) || transaction.amountCoins <= 0
      || !Number.isSafeInteger(transaction.balanceAfterCoins) || transaction.balanceAfterCoins < 0) return true;
    if (transaction.status === "failed" && transaction.reason === "purchase" && transaction.orderNumber !== undefined) return true;
    if (transaction.reason === "purchase") {
      const order = transaction.orderNumber ? orderNumbers.get(transaction.orderNumber) : undefined;
      return !order || order.status === "cancelled" || transaction.direction !== "debit" || transaction.amountCoins !== order.totalCoins;
    }
    if (transaction.reason === "sale") {
      const order = transaction.orderNumber ? orderNumbers.get(transaction.orderNumber) : undefined;
      const matchingSaleEvents = snapshot.tradeEvents.filter((event) => event.direction === "sale"
        && event.status === "completed"
        && event.orderNumber === order?.number
        && order?.items.some((item) => item.kind === "skins" && item.id === event.itemId && item.title === event.title && item.priceCoins === transaction.amountCoins));
      return !order || order.status === "cancelled" || transaction.direction !== "credit"
        || !order.items.some((item) => item.kind === "skins" && item.priceCoins === transaction.amountCoins)
        || matchingSaleEvents.length !== 1;
    }
    return transaction.direction !== "credit" || transaction.orderNumber !== undefined;
  })) return false;

  if (snapshot.orders.some((order) => order.status !== "cancelled" && snapshot.transactions.filter((transaction) => (
    transaction.status === "completed"
    && transaction.reason === "purchase"
    && transaction.orderNumber === order.number
    && transaction.direction === "debit"
    && transaction.amountCoins === order.totalCoins
  )).length !== 1)) return false;

  if (snapshot.tradeEvents.some((event) => {
    if (event.orderNumber === undefined || event.itemId === undefined) return true;
    const order = orderNumbers.get(event.orderNumber);
    const item = order?.items.find((candidate) => candidate.id === event.itemId);
    if (!order || !item || item.kind !== "skins" || item.title !== event.title) return true;
    if (event.direction !== "purchase" && order.status !== "completed") return true;
    if (event.direction === "purchase") {
      const expectedStatus = order.status === "completed" ? "completed" : "processing";
      return event.status !== expectedStatus;
    }
    if (event.direction === "sale") return event.status !== "completed" || snapshot.transactions.filter((transaction) => transaction.reason === "sale" && transaction.orderNumber === order.number && transaction.amountCoins === item.priceCoins && transaction.status === "completed").length !== 1;
    return event.status !== "processing";
  })) return false;

  if (snapshot.orders.some((order) => {
    if (order.status === "cancelled") return snapshot.tradeEvents.some((event) => event.orderNumber === order.number);
    const skinItems = order.items.filter((item) => item.kind === "skins");
    return skinItems.some((item) => {
      const expectedPurchaseStatus = order.status === "completed" ? "completed" : "processing";
      const purchaseEvents = snapshot.tradeEvents.filter((event) => event.direction === "purchase" && event.orderNumber === order.number && event.itemId === item.id && event.title === item.title && event.status === expectedPurchaseStatus);
      const dispositions = snapshot.tradeEvents.filter((event) => (event.direction === "sale" || event.direction === "withdrawal") && event.orderNumber === order.number && event.itemId === item.id);
      return purchaseEvents.length !== 1 || dispositions.length > 1;
    });
  })) return false;

  const ledger = [...snapshot.transactions]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  let runningBalance = 0;
  for (const transaction of ledger) {
    if (transaction.status === "completed") {
      runningBalance += transaction.direction === "credit" ? transaction.amountCoins : -transaction.amountCoins;
    }
    if (!Number.isSafeInteger(runningBalance) || runningBalance < 0) return false;
    if (runningBalance !== transaction.balanceAfterCoins) return false;
  }
  return runningBalance === snapshot.balanceCoins;
}

function isChronologicallyValidSnapshot(snapshot: AccountSnapshot) {
  return snapshot.orders.every((order) => {
    const orderCreatedAt = Date.parse(order.createdAt);
    const purchaseDebits = snapshot.transactions.filter((transaction) => (
      transaction.status === "completed"
      && transaction.reason === "purchase"
      && transaction.direction === "debit"
      && transaction.orderNumber === order.number
    ));
    if (purchaseDebits.some((transaction) => Date.parse(transaction.createdAt) < orderCreatedAt)) return false;
    const saleCredits = snapshot.transactions.filter((transaction) => (
      transaction.status === "completed"
      && transaction.reason === "sale"
      && transaction.direction === "credit"
      && transaction.orderNumber === order.number
    ));
    if (saleCredits.some((transaction) => {
      const transactionTime = Date.parse(transaction.createdAt);
      return transactionTime < orderCreatedAt || !snapshot.tradeEvents.some((event) => (
        event.direction === "sale"
        && event.status === "completed"
        && event.orderNumber === order.number
        && Date.parse(event.createdAt) <= transactionTime
        && order.items.some((item) => item.kind === "skins" && item.id === event.itemId && item.title === event.title && item.priceCoins === transaction.amountCoins)
      ));
    })) return false;
    const skinItems = order.items.filter((item) => item.kind === "skins");
    if (skinItems.some((item) => {
      const purchases = snapshot.tradeEvents.filter((event) => event.direction === "purchase" && event.orderNumber === order.number && event.itemId === item.id);
      const dispositions = snapshot.tradeEvents.filter((event) => (event.direction === "sale" || event.direction === "withdrawal") && event.orderNumber === order.number && event.itemId === item.id);
      return dispositions.some((disposition) => !purchases.some((purchase) => Date.parse(purchase.createdAt) <= Date.parse(disposition.createdAt)));
    })) return false;
    return snapshot.tradeEvents.every((event) => (
      event.orderNumber !== order.number
      || Date.parse(event.createdAt) >= orderCreatedAt
    ));
  });
}

export function normalizeAccountSnapshot(value: unknown): AccountSnapshot {
  if (!isRecord(value)) return createEmptyAccountSnapshot();
  return {
    balanceCoins: typeof value.balanceCoins === "number" && Number.isFinite(value.balanceCoins)
      ? Math.max(0, Math.floor(value.balanceCoins))
      : 0,
    orders: normalizeOrders(value.orders),
    transactions: normalizeTransactions(value.transactions),
    tradeEvents: normalizeTradeEvents(value.tradeEvents),
    steamTradeUrl: normalizeSteamTradeUrl(value.steamTradeUrl),
    isSeedData: value.isSeedData === true,
  };
}

function createLegacyCompatibleSnapshot(value: unknown, preferLedgerBalance = false): AccountSnapshot | null {
  if (!isRecord(value) || typeof value.balanceCoins !== "number" || !Number.isSafeInteger(value.balanceCoins) || value.balanceCoins < 0) return null;
  const normalized = normalizeAccountSnapshot(value);
  const upgradeLegacyTrades = () => {
    const usedItems = new Set<string>();
    const upgraded = normalized.tradeEvents.flatMap((event) => {
      if (event.direction !== "purchase") return [];
      const skinOrders = normalized.orders.filter((candidate) => candidate.status !== "cancelled" && candidate.items.some((item) => item.kind === "skins"));
      const order = event.orderNumber
        ? normalized.orders.find((candidate) => candidate.number === event.orderNumber)
        : skinOrders.length === 1 ? skinOrders[0] : undefined;
      const candidates = order?.items.filter((item) => item.kind === "skins" && !usedItems.has(item.id)) ?? [];
      const item = event.itemId
        ? order?.items.find((candidate) => candidate.kind === "skins" && candidate.id === event.itemId)
        : candidates.filter((candidate) => candidate.title === event.title).length === 1
          ? candidates.find((candidate) => candidate.title === event.title)
          : candidates.length === 1 ? candidates[0] : undefined;
      if (!order || !item || order.status === "cancelled") return [];
      usedItems.add(item.id);
      return [{ ...event, title: item.title, itemId: item.id, orderNumber: order.number, status: order.status === "completed" ? "completed" as const : "processing" as const }];
    });
    normalized.orders.forEach((order) => {
      if (order.status === "cancelled") return;
      order.items.filter((item) => item.kind === "skins" && !usedItems.has(item.id)).forEach((item) => upgraded.push({
        id: `legacy-trade-${order.id}-${item.id}`,
        createdAt: order.createdAt,
        direction: "purchase",
        title: item.title,
        itemId: item.id,
        orderNumber: order.number,
        status: order.status === "completed" ? "completed" : "processing",
      }));
    });
    return upgraded;
  };
  const upgradedSnapshot = { ...normalized, tradeEvents: upgradeLegacyTrades() };
  if (isSemanticallyValidSnapshot(upgradedSnapshot)) return upgradedSnapshot;
  const latestCompleted = [...normalized.transactions]
    .filter((transaction) => transaction.status === "completed")
    .sort(newestFirst)[0];
  const legacyBalance = preferLedgerBalance && latestCompleted
    ? latestCompleted.balanceAfterCoins
    : normalized.balanceCoins;
  const orders = normalized.orders;
  const chargedOrders = orders
    .filter((order) => order.status !== "cancelled")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  const candidates = normalized.transactions.filter((transaction) => transaction.reason === "purchase");
  const usedIds = new Set<string>();
  const purchases = chargedOrders.map((order) => {
    const matchingNumber = candidates.find((transaction) => !usedIds.has(transaction.id) && transaction.orderNumber === order.number && transaction.amountCoins === order.totalCoins);
    const matchingAmount = candidates.find((transaction) => !usedIds.has(transaction.id) && transaction.amountCoins === order.totalCoins);
    const existing = matchingNumber ?? matchingAmount;
    const id = existing?.id ?? `legacy-purchase-${order.id}`;
    usedIds.add(id);
    return {
      id,
      createdAt: existing?.createdAt ?? order.createdAt,
      direction: "debit" as const,
      reason: "purchase" as const,
      amountCoins: order.totalCoins,
      balanceAfterCoins: 0,
      status: "completed" as const,
      orderNumber: order.number,
      description: existing?.description?.trim() || `Покупка: ${order.items.map((item) => item.title).join(", ")}`,
      isDemo: existing?.isDemo ?? true,
    };
  }).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  const totalPurchases = purchases.reduce((sum, transaction) => sum + transaction.amountCoins, 0);
  const openingAmount = legacyBalance + totalPurchases;
  if (!Number.isSafeInteger(openingAmount)) return null;
  let runningBalance = openingAmount;
  const ledger: CoinTransaction[] = [];
  if (openingAmount > 0) {
    ledger.push({
      id: `legacy-opening-${orders.map((order) => order.id).sort().join("-") || "balance"}-${legacyBalance}`,
      createdAt: "2000-01-01T00:00:00.000Z",
      direction: "credit",
      reason: "top-up",
      amountCoins: openingAmount,
      balanceAfterCoins: openingAmount,
      status: "completed",
      description: "Перенос баланса из предыдущей версии",
      isDemo: true,
    });
  }
  purchases.forEach((transaction) => {
    runningBalance -= transaction.amountCoins;
    ledger.push({ ...transaction, balanceAfterCoins: runningBalance });
  });
  const skinOrders = orders.filter((order) => order.items.some((item) => item.kind === "skins"));
  const tradeEvents = upgradedSnapshot.tradeEvents.flatMap((event) => {
    if (event.direction !== "purchase") return [event];
    const exactOrder = event.orderNumber ? skinOrders.find((order) => order.number === event.orderNumber) : undefined;
    const titleOrder = skinOrders.find((order) => order.items.some((item) => item.kind === "skins" && item.title === event.title));
    const order = exactOrder ?? titleOrder ?? (skinOrders.length === 1 ? skinOrders[0] : undefined);
    const item = order?.items.find((candidate) => candidate.kind === "skins" && candidate.title === event.title)
      ?? (order?.items.filter((candidate) => candidate.kind === "skins").length === 1 ? order.items.find((candidate) => candidate.kind === "skins") : undefined);
    const matchingItems = order?.items.filter((candidate) => candidate.kind === "skins" && candidate.title === event.title) ?? [];
    const safeItem = event.itemId
      ? order?.items.find((candidate) => candidate.kind === "skins" && candidate.id === event.itemId)
      : matchingItems.length === 1 ? matchingItems[0] : item;
    if (!order || !safeItem) return [];
    return [{ ...event, title: safeItem.title, itemId: safeItem.id, orderNumber: order.number, status: order.status === "completed" ? "completed" as const : "processing" as const }];
  });
  const snapshot: AccountSnapshot = { ...normalized, balanceCoins: legacyBalance, transactions: ledger.sort(newestFirst), tradeEvents };
  return isSemanticallyValidSnapshot(snapshot) ? snapshot : null;
}

function reconcileUnchargedLegacyOrders(snapshot: AccountSnapshot): AccountSnapshot {
  const orders = snapshot.orders.map((order) => {
    if (order.status === "cancelled") return order;
    const hasDebit = snapshot.transactions.some((transaction) => (
      transaction.status === "completed"
      && transaction.reason === "purchase"
      && transaction.direction === "debit"
      && transaction.orderNumber === order.number
      && transaction.amountCoins === order.totalCoins
    ));
    return hasDebit ? order : {
      ...order,
      status: "cancelled" as const,
      items: order.items.map((item) => ({ ...item, deliveryStatus: "pending" as const })),
    };
  });
  return { ...snapshot, orders };
}

export function initialSnapshotForSession(session: MarketplaceSession | null) {
  return session?.steamAccount && !session.emailAccount
    ? createSeedSteamAccountSnapshot()
    : createEmptyAccountSnapshot();
}

export function migrateMarketplaceState(value: unknown): PersistedMarketplaceState {
  const empty: PersistedMarketplaceState = { version: 5, revision: 0, cartIds: [], session: null, currentAccountKey: null, accounts: {}, identityLinks: {} };
  if (!isRecord(value)) return empty;
  const cartIds = Array.isArray(value.cartIds) ? value.cartIds.filter((id): id is string => typeof id === "string") : [];
  const session = isMarketplaceSession(value.session) ? value.session : null;
  const currentAccountKey = getSessionAccountKey(session);
  const revision = typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0
    ? value.revision
    : 0;

  if (value.version === 4 || value.version === 5) {
    const accounts: Record<string, AccountSnapshot> = {};
    if (isRecord(value.accounts)) {
      Object.entries(value.accounts).forEach(([key, snapshot]) => {
        if (key.startsWith("email:") || key.startsWith("steam:")) {
          const normalized = value.version === 4 ? createLegacyCompatibleSnapshot(snapshot, true) : normalizeAccountSnapshot(snapshot);
          if (normalized) accounts[key] = normalized;
        }
      });
    }
    let identityLinks: Record<string, MarketplaceSession> = buildIdentityLinks({}, session);
    if (value.version === 5 && isRecord(value.identityLinks)) {
      Object.entries(value.identityLinks).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, linkedSession]) => {
        if (
          (key.startsWith("email:") || key.startsWith("steam:"))
          && isMarketplaceSession(linkedSession)
          && sessionContainsAccount(linkedSession, key)
        ) {
          identityLinks = buildIdentityLinks(identityLinks, linkedSession);
        }
      });
    }

    const linkedSessions = new Map<string, MarketplaceSession>();
    Object.values(identityLinks).forEach((linkedSession) => {
      const signature = getSessionAccountKeys(linkedSession).sort().join("|");
      if (signature) linkedSessions.set(signature, linkedSession);
    });
    if (value.version === 4) linkedSessions.forEach((linkedSession) => {
      const keys = getSessionAccountKeys(linkedSession);
      const snapshots = keys.map((key) => accounts[key]).filter((snapshot): snapshot is AccountSnapshot => Boolean(snapshot));
      if (!snapshots.length) return;
      const merged = createLegacyCompatibleSnapshot(mergeLegacyAccountSnapshots(snapshots), true);
      if (merged) keys.forEach((key) => { accounts[key] = merged; });
    });

    return { version: 5, revision, cartIds, session, currentAccountKey, accounts, identityLinks };
  }

  if (!currentAccountKey) return { ...empty, cartIds };
  const legacySnapshot = createLegacyCompatibleSnapshot(value);
  return {
    version: 5,
    revision,
    cartIds,
    session,
    currentAccountKey,
    accounts: legacySnapshot ? { [currentAccountKey]: legacySnapshot } : {},
    identityLinks: buildIdentityLinks({}, session),
  };
}

function isValidRevision(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER - 1;
}

function isStructurallyValidSnapshot(value: unknown, requireSemanticConsistency = false) {
  if (!isRecord(value)) return false;
  const structurallyValid = typeof value.balanceCoins === "number"
    && Number.isFinite(value.balanceCoins)
    && Number.isSafeInteger(value.balanceCoins)
    && value.balanceCoins >= 0
    && Array.isArray(value.orders)
    && normalizeOrders(value.orders).length === value.orders.length
    && Array.isArray(value.transactions)
    && normalizeTransactions(value.transactions).length === value.transactions.length
    && Array.isArray(value.tradeEvents)
    && normalizeTradeEvents(value.tradeEvents).length === value.tradeEvents.length
    && typeof value.steamTradeUrl === "string"
    && (value.steamTradeUrl === "" || normalizeSteamTradeUrl(value.steamTradeUrl) === value.steamTradeUrl)
    && typeof value.isSeedData === "boolean";
  if (!structurallyValid || !requireSemanticConsistency) return structurallyValid;
  const normalized = normalizeAccountSnapshot(value);
  return isSemanticallyValidSnapshot(normalized) && isChronologicallyValidSnapshot(normalized);
}

function isStructurallyValidPersistedState(value: unknown, expectedVersion: number) {
  if (!isRecord(value) || value.version !== expectedVersion) return false;
  if (expectedVersion === 5 ? !isValidRevision(value.revision) : value.revision !== undefined && !isValidRevision(value.revision)) return false;
  if (!Array.isArray(value.cartIds) || value.cartIds.some((id) => typeof id !== "string")) return false;
  if (value.session !== null && !isMarketplaceSession(value.session)) return false;

  if (expectedVersion === 4 || expectedVersion === 5) {
    if (!isRecord(value.accounts)) return false;
    const persistedAccounts = value.accounts;
    if (Object.entries(persistedAccounts).some(([key, snapshot]) => (
      (!key.startsWith("email:") && !key.startsWith("steam:")) || !isStructurallyValidSnapshot(snapshot, expectedVersion === 5)
    ))) return false;
    if (expectedVersion === 5) {
      if (!isRecord(value.identityLinks)) return false;
      if (Object.entries(value.identityLinks).some(([key, linkedSession]) => (
        (!key.startsWith("email:") && !key.startsWith("steam:"))
        || !isMarketplaceSession(linkedSession)
        || !sessionContainsAccount(linkedSession, key)
      ))) return false;
      const identityLinks = value.identityLinks as Record<string, MarketplaceSession>;
      const providerOwners = new Map<string, string>();
      for (const [alias, linkedSession] of Object.entries(identityLinks)) {
        const keys = getSessionAccountKeys(linkedSession).sort();
        const signature = keys.join("|");
        if (!signature || !keys.every((key) => JSON.stringify(identityLinks[key]) === JSON.stringify(linkedSession))) return false;
        for (const key of keys) {
          const owner = providerOwners.get(key);
          if (owner && owner !== signature) return false;
          providerOwners.set(key, signature);
        }
        const aliasSnapshot = persistedAccounts[alias];
        if (!aliasSnapshot || keys.some((key) => JSON.stringify(persistedAccounts[key]) !== JSON.stringify(aliasSnapshot))) return false;
      }
    }
    const session = value.session as MarketplaceSession | null;
    const expectedAccountKey = getSessionAccountKey(session);
    if (expectedVersion === 5 && value.currentAccountKey !== expectedAccountKey) return false;
    if (session && getSessionAccountKeys(session).some((key) => !Object.hasOwn(persistedAccounts, key))) return false;
    if (expectedVersion === 5 && session && getSessionAccountKeys(session).some((key) => (
      JSON.stringify((value.identityLinks as Record<string, MarketplaceSession>)[key]) !== JSON.stringify(session)
    ))) return false;
    return value.currentAccountKey === undefined || value.currentAccountKey === null || typeof value.currentAccountKey === "string";
  }

  return typeof value.balanceCoins === "number"
    && Number.isFinite(value.balanceCoins)
    && Number.isSafeInteger(value.balanceCoins)
    && value.balanceCoins >= 0
    && Array.isArray(value.orders)
    && Array.isArray(value.transactions);
}

export function readNewestValidMarketplaceState(
  storage: Pick<Storage, "getItem">,
  candidates: ReadonlyArray<{ key: string; version: number }>,
) {
  const valid = candidates.flatMap((candidate) => {
    try {
      const raw = storage.getItem(candidate.key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!isStructurallyValidPersistedState(parsed, candidate.version)) return [];
      const state = migrateMarketplaceState(parsed);
      if (!isStructurallyValidPersistedState(state, 5)) return [];
      return [{ version: candidate.version, state }];
    } catch {
      return [];
    }
  });
  const current = valid.find((candidate) => candidate.version === 5);
  if (current) return current.state;
  return valid.sort((left, right) => (
    right.state.revision - left.state.revision || right.version - left.version
  ))[0]?.state ?? null;
}

export function readPersistedMarketplaceState(
  storage: Pick<Storage, "getItem">,
  key: string,
) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStructurallyValidPersistedState(parsed, 5) ? migrateMarketplaceState(parsed) : null;
  } catch {
    return null;
  }
}

export type MarketplaceMutationOrigin = { revision: number; sessionSignature: string };

export function getMarketplaceSessionSignature(session: MarketplaceSession | null) {
  return getSessionAccountKeys(session).sort().join("|");
}

export function createMarketplaceMutationOrigin(state: PersistedMarketplaceState): MarketplaceMutationOrigin {
  return { revision: state.revision, sessionSignature: getMarketplaceSessionSignature(state.session) };
}

export function isMarketplaceMutationOriginCurrent(
  state: PersistedMarketplaceState,
  origin: MarketplaceMutationOrigin,
) {
  return state.revision === origin.revision
    && getMarketplaceSessionSignature(state.session) === origin.sessionSignature;
}

export function shouldApplyPersistedState(currentRevision: number, nextState: PersistedMarketplaceState) {
  return nextState.revision > currentRevision;
}

export function createRevisionedMarketplaceState(
  state: PersistedMarketplaceState,
  changes: Partial<Omit<PersistedMarketplaceState, "version" | "revision">>,
): PersistedMarketplaceState {
  const nextRevision = state.revision + 1;
  if (!isValidRevision(state.revision) || !isValidRevision(nextRevision)) throw new Error("Marketplace revision is not safely incrementable.");
  return {
    ...state,
    ...changes,
    version: 5,
    revision: nextRevision,
  };
}

export function parseMarketplaceStorageEvent(
  storageKey: string,
  event: Pick<StorageEvent, "key" | "newValue">,
  currentRevision: number,
) {
  if (event.key !== storageKey || !event.newValue) return null;
  try {
    const parsed: unknown = JSON.parse(event.newValue);
    if (!isStructurallyValidPersistedState(parsed, 5)) return null;
    const state = migrateMarketplaceState(parsed);
    return shouldApplyPersistedState(currentRevision, state) ? state : null;
  } catch {
    return null;
  }
}

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
};

type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export async function requestMarketplaceLock<T>({
  locks,
  storage: _storage,
  lockName,
}: {
  locks?: LockManagerLike;
  storage: LeaseStorage;
  lockName: string;
}, task: () => Promise<T> | T): Promise<T> {
  void _storage;
  if (!locks) throw new Error("marketplace-lock-unavailable");
  return locks.request(lockName, task);
}

export function persistMarketplaceState(
  storage: Pick<Storage, "setItem">,
  key: string,
  state: PersistedMarketplaceState,
) {
  try {
    if (!isStructurallyValidPersistedState(state, 5)) return false;
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function safeSetLocalStorage(storage: Pick<Storage, "setItem">, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
