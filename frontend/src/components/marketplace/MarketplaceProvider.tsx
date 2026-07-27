"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { catalogProducts } from "@/data/products";
import {
  normalizeSteamTradeUrl,
} from "@/lib/account";
import {
  createMockEmailUser,
  createMockSteamUser,
  type MarketplaceSession,
} from "@/lib/auth";
import {
  getCartSummary,
  normalizeCartIds,
  resolveCartProducts,
} from "@/lib/cart";
import { getCartNotice } from "@/lib/marketplace";
import {
  buildIdentityLinks,
  createRevisionedMarketplaceState,
  createMarketplaceMutationOrigin,
  createEmptyAccountSnapshot,
  getSessionAccountKey,
  getSessionAccountKeys,
  initialSnapshotForSession,
  migrateMarketplaceState,
  parseMarketplaceStorageEvent,
  persistMarketplaceState,
  readPersistedMarketplaceState,
  readNewestValidMarketplaceState,
  requestMarketplaceLock,
  resolveAccountConnection,
  synchronizeLinkedAccountSnapshots,
  isMarketplaceMutationOriginCurrent,
  type AccountSnapshot,
} from "@/lib/marketplace-state";
import type { FulfillmentInput } from "@/lib/fulfillment";
import { prepareCheckoutTransaction } from "@/lib/marketplace-transaction";
import { sellInventoryItem, withdrawInventoryItem } from "@/lib/inventory-actions";
import type { Product } from "@/types/commerce";
import type { CoinTransaction, MarketplaceOrder, TradeEvent } from "@/types/account";

export type CartItemInput = { id: string; title?: string };
export type CheckoutResult =
  | { status: "empty" | "insufficient" | "auth-required" | "steam-required" | "trade-url-required" | "fulfillment-invalid" | "storage-error" | "busy" | "lock-unavailable" }
  | {
      status: "success";
      orderNumber: string;
      itemCount: number;
      totalCoins: number;
      remainingCoins: number;
    };

export type AuthActionResult =
  | { ok: true; session: MarketplaceSession }
  | { ok: false; message: string };

export type CheckoutReview = {
  revision: number;
  cartIds: string[];
  sessionSignature: string;
  accountKey: string | null;
  steamTradeUrl: string;
};

const STORAGE_KEY = "vault-marketplace-state-v5";
const V4_STORAGE_KEY = "vault-marketplace-state-v4";
const V3_STORAGE_KEY = "vault-marketplace-state-v3";
const V2_STORAGE_KEY = "vault-marketplace-state-v2";
const LEGACY_STORAGE_KEY = "vault-marketplace-state-v1";

type MarketplaceContextValue = {
  cart: Product[];
  balanceCoins: number;
  cartTotalCoins: number;
  cartShortfallCoins: number;
  hasSufficientBalance: boolean;
  requiresSteam: boolean;
  canPurchase: boolean;
  orders: MarketplaceOrder[];
  transactions: CoinTransaction[];
  tradeEvents: TradeEvent[];
  steamTradeUrl: string;
  session: MarketplaceSession | null;
  isAuthenticated: boolean;
  hasSteam: boolean;
  isHydrated: boolean;
  marketplaceRevision: number;
  addToCart: (item: CartItemInput) => Promise<boolean>;
  removeFromCart: (id: string) => Promise<boolean>;
  accountKey: string | null;
  hasSeedData: boolean;
  checkoutCart: (fulfillment: FulfillmentInput, review: CheckoutReview) => Promise<CheckoutResult>;
  signInWithEmail: (email: string) => Promise<AuthActionResult>;
  connectSteamDemo: () => Promise<AuthActionResult>;
  saveSteamTradeUrl: (value: string) => Promise<boolean>;
  sellInventoryItem: (itemId: string) => Promise<boolean>;
  withdrawInventoryItem: (itemId: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  notice: string;
  clearNotice: () => void;
  notify: (message: string) => void;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [balanceCoins, setBalanceCoins] = useState(0);
  const [session, setSession] = useState<MarketplaceSession | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [tradeEvents, setTradeEvents] = useState<TradeEvent[]>([]);
  const [steamTradeUrl, setSteamTradeUrl] = useState("");
  const [hasSeedData, setHasSeedData] = useState(false);
  const [accounts, setAccounts] = useState<Record<string, AccountSnapshot>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [marketplaceRevision, setMarketplaceRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const persistedStateRef = useRef(migrateMarketplaceState(null));

  const applyPersistedState = useCallback((state: ReturnType<typeof migrateMarketplaceState>) => {
    const validCartIds = normalizeCartIds(state.cartIds, catalogProducts);
    const validSession = state.session;
    const key = getSessionAccountKey(validSession);
    const snapshot = key
      ? state.accounts[key] ?? initialSnapshotForSession(validSession)
      : createEmptyAccountSnapshot();

    persistedStateRef.current = { ...state, cartIds: validCartIds };
    setMarketplaceRevision(state.revision);
    setCartIds(validCartIds);
    setBalanceCoins(snapshot.balanceCoins);
    setSession(validSession);
    setOrders(snapshot.orders);
    setTransactions(snapshot.transactions);
    setTradeEvents(snapshot.tradeEvents);
    setSteamTradeUrl(snapshot.steamTradeUrl);
    setHasSeedData(snapshot.isSeedData);
    setAccounts(state.accounts);
  }, []);

  useEffect(() => {
    let migrated = migrateMarketplaceState(null);
    let hydrationComplete = false;
    function synchronizeFromStorage(event: StorageEvent) {
      const highestQueuedRevision = Math.max(persistedStateRef.current.revision, migrated.revision);
      const liveCandidate = parseMarketplaceStorageEvent(STORAGE_KEY, event, persistedStateRef.current.revision);
      const state = liveCandidate && liveCandidate.revision > highestQueuedRevision ? liveCandidate : null;
      if (!state) return;
      migrated = state;
      if (hydrationComplete) applyPersistedState(state);
    }
    window.addEventListener("storage", synchronizeFromStorage);
    const stored = readNewestValidMarketplaceState(window.localStorage, [
      { key: STORAGE_KEY, version: 5 },
      { key: V4_STORAGE_KEY, version: 4 },
      { key: V3_STORAGE_KEY, version: 3 },
      { key: V2_STORAGE_KEY, version: 2 },
      { key: LEGACY_STORAGE_KEY, version: 1 },
    ]);
    if (stored && stored.revision >= migrated.revision) migrated = stored;
    const hydrationTask = window.setTimeout(() => {
      hydrationComplete = true;
      applyPersistedState(migrated);
      setIsHydrated(true);
    }, 0);

    return () => {
      window.clearTimeout(hydrationTask);
      window.removeEventListener("storage", synchronizeFromStorage);
    };
  }, [applyPersistedState]);

  const cart = useMemo(
    () => resolveCartProducts(catalogProducts, cartIds),
    [cartIds],
  );
  const cartSummary = useMemo(
    () => getCartSummary(cart, balanceCoins),
    [balanceCoins, cart],
  );
  const isAuthenticated = !!(session?.emailAccount || session?.steamAccount);
  const hasSteam = !!session?.steamAccount;
  const requiresSteam = cart.some((product) => product.kind === "skins");
  const canPurchase =
    cartSummary.canPurchase && isAuthenticated && (!requiresSteam || hasSteam);
  const accountKey = getSessionAccountKey(session);

  const persistCurrentState = useCallback(async (overrides: {
    cartIds?: string[] | ((current: string[]) => string[]);
    session?: MarketplaceSession | null;
    accounts?: Record<string, AccountSnapshot>;
    identityLinks?: Record<string, MarketplaceSession>;
    balanceCoins?: number;
    orders?: MarketplaceOrder[];
    transactions?: CoinTransaction[];
    tradeEvents?: TradeEvent[];
    steamTradeUrl?: string;
    hasSeedData?: boolean;
  } = {}) => {
    if (!isHydrated) {
      setNotice("Данные аккаунта ещё загружаются. Повторите действие через секунду.");
      return null;
    }
    const origin = createMarketplaceMutationOrigin(persistedStateRef.current);
    try {
      return await requestMarketplaceLock({
        locks: navigator.locks,
        storage: window.localStorage,
        lockName: "vault-marketplace-state-v5",
      }, () => {
    const latest = readPersistedMarketplaceState(window.localStorage, STORAGE_KEY) ?? persistedStateRef.current;
    if (!isMarketplaceMutationOriginCurrent(latest, origin)) {
      setNotice("Данные аккаунта изменились в другой вкладке. Проверьте текущий профиль и повторите действие.");
      return null;
    }
    const base = latest;
    const nextSession = Object.hasOwn(overrides, "session") ? overrides.session ?? null : base.session;
    const baseKey = getSessionAccountKey(nextSession);
    const baseSnapshot = baseKey
      ? base.accounts[baseKey] ?? initialSnapshotForSession(nextSession)
      : createEmptyAccountSnapshot();
    const nextSnapshot = {
      balanceCoins: overrides.balanceCoins ?? baseSnapshot.balanceCoins,
      orders: overrides.orders ?? baseSnapshot.orders,
      transactions: overrides.transactions ?? baseSnapshot.transactions,
      tradeEvents: overrides.tradeEvents ?? baseSnapshot.tradeEvents,
      steamTradeUrl: overrides.steamTradeUrl ?? baseSnapshot.steamTradeUrl,
      isSeedData: overrides.hasSeedData ?? baseSnapshot.isSeedData,
    };
    const nextAccounts = { ...base.accounts, ...(overrides.accounts ?? {}) };
    getSessionAccountKeys(nextSession).forEach((key) => { nextAccounts[key] = nextSnapshot; });
    const nextIdentityLinks = buildIdentityLinks({ ...base.identityLinks, ...(overrides.identityLinks ?? {}) }, nextSession);
    const state = createRevisionedMarketplaceState(base, {
      cartIds: typeof overrides.cartIds === "function"
        ? overrides.cartIds(base.cartIds)
        : overrides.cartIds ?? base.cartIds,
      session: nextSession,
      currentAccountKey: getSessionAccountKey(nextSession),
      accounts: nextAccounts,
      identityLinks: nextIdentityLinks,
    });
    if (!persistMarketplaceState(window.localStorage, STORAGE_KEY, state)) {
      setNotice("Не удалось сохранить изменение в этом браузере. Действие отменено — проверьте доступ к хранилищу сайта.");
      return null;
    }
    try {
      [V4_STORAGE_KEY, V3_STORAGE_KEY, V2_STORAGE_KEY, LEGACY_STORAGE_KEY].forEach((key) => window.localStorage.removeItem(key));
    } catch { /* Legacy cleanup does not affect the committed v5 state. */ }
    applyPersistedState(state);
    return { accounts: nextAccounts, identityLinks: nextIdentityLinks, state };
      });
    } catch (error) {
      setNotice(error instanceof Error && error.message === "marketplace-lock-unavailable"
        ? "Безопасное сохранение недоступно в этом браузере. Откройте сайт в актуальной версии браузера."
        : "Изменение не сохранено: другая вкладка обновляет аккаунт. Повторите действие.");
      return null;
    }
  }, [applyPersistedState, isHydrated]);

  const activateSession = useCallback(async (nextSession: MarketplaceSession, origin = createMarketplaceMutationOrigin(persistedStateRef.current)) => {
    try {
      return await requestMarketplaceLock({
        locks: navigator.locks,
        storage: window.localStorage,
        lockName: "vault-marketplace-state-v5",
      }, () => {
        const base = readPersistedMarketplaceState(window.localStorage, STORAGE_KEY) ?? persistedStateRef.current;
        if (!isMarketplaceMutationOriginCurrent(base, origin)) {
          setNotice("Сессия изменилась в другой вкладке. Проверьте текущий аккаунт и повторите вход.");
          return false;
        }
        const nextIdentityLinks = buildIdentityLinks(base.identityLinks, nextSession);
        const nextKeys = getSessionAccountKeys(nextSession).sort().join("|");
        const identityConflict = getSessionAccountKeys(nextSession).some((key) => (
          getSessionAccountKeys(nextIdentityLinks[key] ?? null).sort().join("|") !== nextKeys
        ));
        if (identityConflict) return false;
        const currentKey = getSessionAccountKey(base.session);
        const currentSnapshot = currentKey
          ? base.accounts[currentKey] ?? initialSnapshotForSession(base.session)
          : createEmptyAccountSnapshot();
        const linked = synchronizeLinkedAccountSnapshots({ accounts: base.accounts, currentSession: base.session, nextSession, currentSnapshot });
        const nextState = createRevisionedMarketplaceState(base, {
          session: nextSession,
          currentAccountKey: getSessionAccountKey(nextSession),
          accounts: linked.accounts,
          identityLinks: nextIdentityLinks,
        });
        if (!persistMarketplaceState(window.localStorage, STORAGE_KEY, nextState)) return false;
        applyPersistedState(nextState);
        return true;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "marketplace-lock-unavailable") {
        setNotice("Безопасное сохранение недоступно в этом браузере. Откройте сайт в актуальной версии браузера.");
      } else if (error instanceof Error && /conflict/i.test(error.message)) {
        setNotice("Не удалось связать аккаунты: история или баланс конфликтуют. Данные не изменены.");
      }
      return false;
    }
  }, [applyPersistedState]);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      cart,
      balanceCoins,
      accounts,
      cartTotalCoins: cartSummary.totalCoins,
      cartShortfallCoins: cartSummary.shortfallCoins,
      hasSufficientBalance: cartSummary.canPurchase,
      requiresSteam,
      canPurchase,
      orders,
      transactions,
      tradeEvents,
      steamTradeUrl,
      session,
      isAuthenticated,
      hasSteam,
      accountKey,
      hasSeedData,
      isHydrated,
      marketplaceRevision,
      notice,
      async addToCart(item) {
        const product = catalogProducts.find((entry) => entry.id === item.id);
        if (!product) return false;
        const persisted = await persistCurrentState({ cartIds: (current) => current.includes(item.id) ? current : [...current, item.id] });
        if (!persisted) return false;
        setNotice(getCartNotice(product.title));
        return true;
      },
      async removeFromCart(id) {
        const persisted = await persistCurrentState({ cartIds: (current) => current.filter((itemId) => itemId !== id) });
        return Boolean(persisted);
      },
      async checkoutCart(fulfillment, review) {
        if (!isHydrated) return { status: "busy" };
        try {
          return await requestMarketplaceLock({
            locks: navigator.locks,
            storage: window.localStorage,
            lockName: "vault-marketplace-state-v5",
          }, async () => {
            const latest = readPersistedMarketplaceState(window.localStorage, STORAGE_KEY) ?? persistedStateRef.current;
            const latestCartIds = normalizeCartIds(latest.cartIds, catalogProducts);
            const reviewStillCurrent = latest.revision === review.revision
              && getSessionAccountKeys(latest.session).sort().join("|") === review.sessionSignature
              && getSessionAccountKey(latest.session) === review.accountKey
              && latestCartIds.length === review.cartIds.length
              && latestCartIds.every((id, index) => id === review.cartIds[index])
              && (review.accountKey ? latest.accounts[review.accountKey]?.steamTradeUrl ?? "" : "") === review.steamTradeUrl;
            if (!reviewStillCurrent) {
              setNotice("Корзина или аккаунт изменились в другой вкладке. Проверьте данные и повторите оформление.");
              return { status: "busy" } as const;
            }
            const uniqueId = globalThis.crypto?.randomUUID?.();
            const prepared = prepareCheckoutTransaction(latest, catalogProducts, {
              ...(uniqueId ? { id: `order-${uniqueId}`, transactionId: `transaction-${uniqueId}` } : {}),
              fulfillment,
              expectedRevision: review.revision,
            });
            if (prepared.status === "revision-conflict") return { status: "busy" };
            if (prepared.status !== "success") return { status: prepared.status };
            if (!persistMarketplaceState(window.localStorage, STORAGE_KEY, prepared.state)) return { status: "storage-error" };
            applyPersistedState(prepared.state);
            return {
              status: "success",
              orderNumber: prepared.records.order.number,
              itemCount: prepared.itemCount,
              totalCoins: prepared.totalCoins,
              remainingCoins: prepared.remainingCoins,
            };
          });
        } catch (error) {
          return { status: error instanceof Error && error.message === "marketplace-lock-unavailable"
            ? "lock-unavailable"
            : "busy" };
        }
      },
      async signInWithEmail(email) {
        const origin = createMarketplaceMutationOrigin(persistedStateRef.current);
        const account = createMockEmailUser(email);
        const resolved = resolveAccountConnection(persistedStateRef.current.identityLinks, persistedStateRef.current.session, account);
        if (!resolved.ok) {
          setNotice(resolved.message);
          return resolved;
        }
        return await activateSession(resolved.session, origin)
          ? { ok: true, session: resolved.session }
          : { ok: false, message: "Не удалось сохранить Email-сессию в этом браузере." };
      },
      async connectSteamDemo() {
        const origin = createMarketplaceMutationOrigin(persistedStateRef.current);
        const account = createMockSteamUser();
        const resolved = resolveAccountConnection(persistedStateRef.current.identityLinks, persistedStateRef.current.session, account);
        if (!resolved.ok) {
          setNotice(resolved.message);
          return resolved;
        }
        return await activateSession(resolved.session, origin)
          ? { ok: true, session: resolved.session }
          : { ok: false, message: "Не удалось сохранить Steam-сессию в этом браузере." };
      },
      async saveSteamTradeUrl(value) {
        const normalized = normalizeSteamTradeUrl(value);
        if (!normalized) return false;
        const persisted = await persistCurrentState({ steamTradeUrl: normalized });
        return Boolean(persisted);
      },
      async sellInventoryItem(itemId) {
        const current = getSessionAccountKey(persistedStateRef.current.session);
        if (!current) { setNotice("Войдите в аккаунт, чтобы управлять инвентарём."); return false; }
        const base = persistedStateRef.current.accounts[current] ?? createEmptyAccountSnapshot();
        const result = sellInventoryItem(base, itemId);
        if (!result.ok) { setNotice(result.reason); return false; }
        const persisted = await persistCurrentState({ balanceCoins: result.snapshot.balanceCoins, transactions: result.snapshot.transactions, tradeEvents: result.snapshot.tradeEvents });
        if (!persisted) return false;
        setNotice("Предмет продан сайту, Coins зачислены на баланс.");
        return true;
      },
      async withdrawInventoryItem(itemId) {
        const current = getSessionAccountKey(persistedStateRef.current.session);
        if (!current) { setNotice("Войдите в аккаунт, чтобы управлять инвентарём."); return false; }
        if (!persistedStateRef.current.session?.steamAccount) { setNotice("Подключите Steam-профиль перед выводом предмета."); return false; }
        const base = persistedStateRef.current.accounts[current] ?? createEmptyAccountSnapshot();
        const result = withdrawInventoryItem(base, itemId, base.steamTradeUrl);
        if (!result.ok) { setNotice(result.reason); return false; }
        const persisted = await persistCurrentState({ tradeEvents: result.snapshot.tradeEvents });
        if (!persisted) return false;
        setNotice("Заявка на вывод сохранена локально. Отправка Steam Trade будет доступна после подключения обработки.");
        return true;
      },
      async signOut() {
        const persisted = await persistCurrentState({ session: null });
        return Boolean(persisted);
      },
      clearNotice() {
        setNotice("");
      },
      notify(message) {
        setNotice(message);
      },
    }),
    [
      accounts,
      balanceCoins,
      accountKey,
      activateSession,
      applyPersistedState,
      canPurchase,
      cart,
      cartSummary,
      hasSteam,
      hasSeedData,
      isAuthenticated,
      isHydrated,
      marketplaceRevision,
      notice,
      orders,
      persistCurrentState,
      requiresSteam,
      session,
      steamTradeUrl,
      transactions,
      tradeEvents,
    ],
  );

  return (
    <MarketplaceContext.Provider value={value}>
      {children}
      {notice ? (
        <div className="marketplace-toast" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Закрыть уведомление">
            Закрыть
          </button>
        </div>
      ) : null}
    </MarketplaceContext.Provider>
  );
}

export function useMarketplace() {
  const value = useContext(MarketplaceContext);
  if (!value) {
    throw new Error("useMarketplace must be used inside MarketplaceProvider");
  }
  return value;
}
