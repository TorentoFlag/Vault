import { createCheckoutRecords } from "./account.ts";
import { getCartSummary, normalizeCartIds, resolveCartProducts } from "./cart.ts";
import {
  buildIdentityLinks,
  createEmptyAccountSnapshot,
  createRevisionedMarketplaceState,
  getSessionAccountKey,
  getSessionAccountKeys,
  initialSnapshotForSession,
  type AccountSnapshot,
  type PersistedMarketplaceState,
} from "./marketplace-state.ts";
import { validateFulfillmentInput, type FulfillmentInput } from "./fulfillment.ts";
import type { Product } from "../types/commerce.ts";

type CheckoutTransactionOptions = {
  fulfillment: FulfillmentInput;
  expectedRevision?: number;
  id?: string;
  transactionId?: string;
  number?: string;
  createdAt?: string;
};

type CheckoutTransactionFailure = {
  status: "revision-conflict" | "empty" | "auth-required" | "insufficient" | "steam-required" | "trade-url-required" | "fulfillment-invalid";
  state: PersistedMarketplaceState;
  snapshot: AccountSnapshot;
};

export type PreparedCheckoutTransaction = CheckoutTransactionFailure | {
  status: "success";
  state: PersistedMarketplaceState;
  snapshot: AccountSnapshot;
  records: ReturnType<typeof createCheckoutRecords>;
  itemCount: number;
  totalCoins: number;
  remainingCoins: number;
};

export function prepareCheckoutTransaction(
  state: PersistedMarketplaceState,
  products: Product[],
  options: CheckoutTransactionOptions,
): PreparedCheckoutTransaction {
  const session = state.session;
  const accountKey = getSessionAccountKey(session);
  const snapshot = accountKey
    ? state.accounts[accountKey] ?? initialSnapshotForSession(session)
    : createEmptyAccountSnapshot();
  if (options.expectedRevision !== undefined && options.expectedRevision !== state.revision) {
    return { status: "revision-conflict", state, snapshot };
  }

  const cart = resolveCartProducts(products, normalizeCartIds(state.cartIds, products));
  const summary = getCartSummary(cart, snapshot.balanceCoins);
  const requiresSteam = cart.some((product) => product.kind === "skins");
  if (!cart.length) return { status: "empty", state, snapshot };
  if (!session) return { status: "auth-required", state, snapshot };
  if (requiresSteam && !session.steamAccount) return { status: "steam-required", state, snapshot };
  if (requiresSteam && !snapshot.steamTradeUrl) return { status: "trade-url-required", state, snapshot };
  if (!summary.canPurchase) return { status: "insufficient", state, snapshot };
  if (Object.keys(validateFulfillmentInput([...new Set(cart.map((product) => product.kind))], options.fulfillment)).length) {
    return { status: "fulfillment-invalid", state, snapshot };
  }

  const records = createCheckoutRecords(cart, summary.remainingCoins, {
    id: options.id,
    transactionId: options.transactionId,
    number: options.number,
    createdAt: options.createdAt,
    fulfillment: options.fulfillment,
    steamTradeUrl: requiresSteam ? snapshot.steamTradeUrl : undefined,
  });
  const nextSnapshot: AccountSnapshot = {
    ...snapshot,
    balanceCoins: summary.remainingCoins,
    orders: [records.order, ...snapshot.orders],
    transactions: [records.transaction, ...snapshot.transactions],
    tradeEvents: [
      ...records.order.items.filter((item) => item.kind === "skins").map((item) => ({
        id: `${records.order.id}-trade-${item.id}`,
        createdAt: records.order.createdAt,
        direction: "purchase" as const,
        title: item.title,
        itemId: item.id,
        orderNumber: records.order.number,
        status: "processing" as const,
      })),
      ...snapshot.tradeEvents,
    ],
  };
  const accounts = { ...state.accounts };
  getSessionAccountKeys(session).forEach((key) => { accounts[key] = nextSnapshot; });
  const nextState = createRevisionedMarketplaceState(state, {
    cartIds: [],
    session,
    currentAccountKey: getSessionAccountKey(session),
    accounts,
    identityLinks: buildIdentityLinks(state.identityLinks, session),
  });

  return {
    status: "success",
    state: nextState,
    snapshot: nextSnapshot,
    records,
    itemCount: cart.length,
    totalCoins: summary.totalCoins,
    remainingCoins: summary.remainingCoins,
  };
}
