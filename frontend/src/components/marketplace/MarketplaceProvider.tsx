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

import {
  normalizeSteamTradeUrl,
} from "@/lib/account";
import {
  createApiClient,
  type ApiMappedInventoryItem,
  type ApiUser,
} from "@/lib/api";
import type { MarketplaceSession } from "@/lib/auth";
import {
  CartApiError,
  checkoutServerCart,
  fetchHydratedCart,
  removeServerCartItem,
  setServerCartItem,
  type HydratedServerCart,
  type ServerCartProduct,
} from "@/lib/cart-api";
import {
  getCartSummary,
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
  isMarketplaceMutationOriginCurrent,
  type AccountSnapshot,
} from "@/lib/marketplace-state";
import type { FulfillmentInput } from "@/lib/fulfillment";
import type { Product } from "@/types/commerce";
import type { CoinTransaction, InventoryItem, MarketplaceOrder, TradeEvent } from "@/types/account";

export type CartItemInput = { id: string; slug?: string; title?: string };
export type CheckoutResult =
  | { status: "empty" | "insufficient" | "auth-required" | "steam-required" | "trade-url-required" | "fulfillment-invalid" | "price-changed" | "storage-error" | "busy" | "lock-unavailable" }
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
  inventoryItems: MarketplaceInventoryItem[];
  transactions: CoinTransaction[];
  tradeEvents: TradeEvent[];
  steamTradeUrl: string;
  hasSteamTradeUrl: boolean;
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
  saveSteamTradeUrl: (value: string) => Promise<boolean>;
  sellInventoryItem: (itemId: string) => Promise<boolean>;
  withdrawInventoryItem: (itemId: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  notice: string;
  clearNotice: () => void;
  notify: (message: string) => void;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

type MarketplaceInventoryAction = {
  enabled: boolean;
  reason: string;
};

export type MarketplaceInventoryItem = InventoryItem & {
  actions: {
    sellToSite: MarketplaceInventoryAction;
    withdrawToSteam: MarketplaceInventoryAction;
  };
};

function orderNumberFromId(id: string) {
  return `VLT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function mapProviderInventoryItem(item: ApiMappedInventoryItem): MarketplaceInventoryItem {
  const withdrawalReason = item.actions.withdrawToSteam.enabled
    ? "Создать серверную заявку на вывод предмета в Steam."
    : item.actions.withdrawToSteam.reason === "steam_trade_url_required"
      ? "Вывод недоступен: сохраните Steam Trade URL."
      : "Вывод в Steam недоступен для этого предмета.";
  return {
    id: item.id,
    orderId: item.orderId,
    orderNumber: orderNumberFromId(item.orderId),
    productId: item.productId,
    slug: item.slug,
    title: item.title,
    kind: "skins",
    priceCoins: item.priceCoins,
    fulfillmentMode: "steam-trade",
    deliveryStatus: "inventory-ready",
    acquiredAt: item.acquiredAt,
    actions: {
      sellToSite: {
        enabled: item.actions.sellToSite.enabled,
        reason: "Выкуп предметов сайтом отключён: для этой операции нет утверждённого способа оценки и расчёта.",
      },
      withdrawToSteam: {
        enabled: item.actions.withdrawToSteam.enabled,
        reason: withdrawalReason,
      },
    },
  };
}

function sessionFromApiUser(user: ApiUser): MarketplaceSession {
  return {
    emailAccount: user.email ? {
      id: `email:${user.email.address}`,
      method: "email",
      displayName: user.email.address.split("@")[0] || "Покупатель",
      email: user.email.address,
      steamConnected: false,
    } : null,
    steamAccount: user.steam.connected && user.steam.steamId64 ? {
      id: `steam:${user.steam.steamId64}`,
      method: "steam",
      displayName: "Steam user",
      steamId: user.steam.steamId64,
      steamConnected: true,
    } : null,
  };
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [serverCart, setServerCart] = useState<HydratedServerCart | null>(null);
  const [serverSyncStatus, setServerSyncStatus] = useState<"checking" | "authenticated" | "fallback">("checking");
  const [balanceCoins, setBalanceCoins] = useState(0);
  const [session, setSession] = useState<MarketplaceSession | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<ApiMappedInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [tradeEvents, setTradeEvents] = useState<TradeEvent[]>([]);
  const [steamTradeUrl, setSteamTradeUrl] = useState("");
  const [serverSteamTradeUrlConfigured, setServerSteamTradeUrlConfigured] = useState(false);
  const [hasSeedData, setHasSeedData] = useState(false);
  const [accounts, setAccounts] = useState<Record<string, AccountSnapshot>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [marketplaceRevision, setMarketplaceRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const persistedStateRef = useRef(migrateMarketplaceState(null));
  const csrfTokenRef = useRef<string | null>(null);

  const applyPersistedState = useCallback((state: ReturnType<typeof migrateMarketplaceState>) => {
    const snapshot = createEmptyAccountSnapshot();

    persistedStateRef.current = { ...state, cartIds: [], session: null, accounts: {}, identityLinks: {} };
    setMarketplaceRevision(state.revision);
    setCartIds([]);
    setBalanceCoins(snapshot.balanceCoins);
    setSession(null);
    setOrders(snapshot.orders);
    setTransactions(snapshot.transactions);
    setTradeEvents(snapshot.tradeEvents);
    setSteamTradeUrl(snapshot.steamTradeUrl);
    setHasSeedData(snapshot.isSeedData);
    setAccounts({});
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

  const isServerBacked = serverSyncStatus === "authenticated";
  const cart = useMemo<Product[]>(
    () => isServerBacked ? serverCart?.products ?? [] : [],
    [cartIds, isServerBacked, serverCart],
  );
  const cartSummary = useMemo(
    () => {
      if (!isServerBacked || !serverCart) return getCartSummary(cart, balanceCoins);
      const totalCoins = serverCart.totalCoins;
      const shortfallCoins = Math.max(0, totalCoins - balanceCoins);
      return {
        itemCount: cart.length,
        totalCoins,
        balanceCoins,
        shortfallCoins,
        remainingCoins: Math.max(0, balanceCoins - totalCoins),
        canPurchase: cart.length > 0 && shortfallCoins === 0,
      };
    },
    [balanceCoins, cart, isServerBacked, serverCart],
  );
  const isAuthenticated = !!(session?.emailAccount || session?.steamAccount);
  const hasSteam = !!session?.steamAccount;
  const requiresSteam = cart.some((product) => product.kind === "skins");
  const hasSteamTradeUrl = isServerBacked ? serverSteamTradeUrlConfigured : !!steamTradeUrl;
  const canPurchase =
    cartSummary.canPurchase && isAuthenticated && (!requiresSteam || hasSteam);
  const accountKey = getSessionAccountKey(session);
  const exposedHydrated = isHydrated && serverSyncStatus !== "checking";

  const applyServerCart = useCallback((cartResponse: HydratedServerCart) => {
    setServerCart(cartResponse);
  }, []);

  const accountInventoryItems = useMemo<MarketplaceInventoryItem[]>(
    () => isServerBacked
      ? inventoryItems.map(mapProviderInventoryItem)
      : [],
    [inventoryItems, isServerBacked],
  );

  const ensureCsrfToken = useCallback(async () => {
    if (csrfTokenRef.current) return csrfTokenRef.current;
    const token = await createApiClient().getCsrfToken();
    csrfTokenRef.current = token;
    return token;
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;

    async function synchronizeServerState() {
      const client = createApiClient();
      try {
        const user = await client.getCurrentUser();
        const [wallet, walletTransactions, tradeUrlStatus, cartResponse, orderHistory, inventory, tradeHistory] = await Promise.all([
          client.getWalletBalance(),
          client.getWalletTransactions(),
          client.getSteamTradeUrlStatus(),
          fetchHydratedCart(),
          client.getOrderHistory(),
          client.getInventory(),
          client.getFulfillmentTradeHistory(),
        ]);
        if (cancelled) return;
        setServerSyncStatus("authenticated");
        setSession(sessionFromApiUser(user));
        setBalanceCoins(wallet.availableCoins);
        setOrders(orderHistory);
        setInventoryItems(inventory);
        setTransactions(walletTransactions);
        setTradeEvents(tradeHistory);
        setSteamTradeUrl("");
        setServerSteamTradeUrlConfigured(tradeUrlStatus.configured);
        setHasSeedData(false);
        applyServerCart(cartResponse);
      } catch {
        if (cancelled) return;
        setServerSyncStatus("fallback");
        setServerCart(null);
        setInventoryItems([]);
        setServerSteamTradeUrlConfigured(false);
      }
    }

    void synchronizeServerState();

    return () => {
      cancelled = true;
    };
  }, [applyServerCart, isHydrated]);

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
      inventoryItems: accountInventoryItems,
      transactions,
      tradeEvents,
      steamTradeUrl,
      hasSteamTradeUrl,
      session,
      isAuthenticated,
      hasSteam,
      accountKey,
      hasSeedData,
      isHydrated: exposedHydrated,
      marketplaceRevision,
      notice,
      async addToCart(item) {
        if (isServerBacked) {
          const productSlug = item.slug;
          if (!productSlug) {
            setNotice("Не удалось определить товар для серверной корзины. Обновите страницу и повторите действие.");
            return false;
          }
          try {
            await ensureCsrfToken();
            const nextCart = await setServerCartItem(productSlug, { quantity: 1 }, { csrfToken: () => csrfTokenRef.current });
            applyServerCart(nextCart);
            setNotice(getCartNotice(item.title ?? productSlug));
            return true;
          } catch {
            setNotice("Не удалось обновить серверную корзину. Проверьте сессию и повторите действие.");
            return false;
          }
        }
        setNotice("Войдите через Steam, чтобы добавить товар в серверную корзину.");
        return false;
      },
      async removeFromCart(id) {
        if (isServerBacked) {
          const product = serverCart?.products.find((entry) => entry.id === id);
          if (!product) return false;
          try {
            await ensureCsrfToken();
            const nextCart = await removeServerCartItem(product.slug, { csrfToken: () => csrfTokenRef.current });
            applyServerCart(nextCart);
            return true;
          } catch {
            setNotice("Не удалось удалить товар из серверной корзины. Повторите действие.");
            return false;
          }
        }
        setNotice("Корзина доступна только после входа.");
        return false;
      },
      async checkoutCart(fulfillment, review) {
        if (isServerBacked) {
          if (!exposedHydrated) return { status: "busy" };
          const currentSessionSignature = [session?.emailAccount?.id, session?.steamAccount?.id].filter(Boolean).sort().join("|");
          const currentTradeUrlState = hasSteamTradeUrl ? steamTradeUrl || "server-configured" : "";
          const currentCartIds = cart.map((product) => product.id).join("\0");
          if (
            review.revision !== marketplaceRevision ||
            review.sessionSignature !== currentSessionSignature ||
            review.accountKey !== accountKey ||
            review.steamTradeUrl !== currentTradeUrlState
          ) {
            return { status: "fulfillment-invalid" };
          }
          if (review.cartIds.join("\0") !== currentCartIds) return { status: "price-changed" };
          try {
            await ensureCsrfToken();
            let latestServerCart = serverCart;
            for (const product of cart) {
              if (product.kind !== "steam") continue;
              latestServerCart = await setServerCartItem(product.slug, {
                quantity: (product as ServerCartProduct).cartQuantity ?? 1,
                recipient: { steamLogin: fulfillment.steamLogin },
              }, { csrfToken: () => csrfTokenRef.current });
            }
            if (latestServerCart) applyServerCart(latestServerCart);
            const acceptedTotalCoinMinor = Math.round((latestServerCart?.totalCoins ?? 0) * 100);
            const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const order = await checkoutServerCart({
              acceptedTotalCoinMinor,
              idempotencyKey: `checkout-${uniqueId}`,
            }, { csrfToken: () => csrfTokenRef.current });
            const client = createApiClient();
            const [wallet, walletTransactions, orderHistory, inventory, tradeHistory] = await Promise.all([
              client.getWalletBalance(),
              client.getWalletTransactions(),
              client.getOrderHistory(),
              client.getInventory(),
              client.getFulfillmentTradeHistory(),
            ]);
            setBalanceCoins(wallet.availableCoins);
            setTransactions(walletTransactions);
            setOrders(orderHistory);
            setInventoryItems(inventory);
            setTradeEvents(tradeHistory);
            applyServerCart({ items: [], totalCoins: 0, products: [] });
            return {
              status: "success",
              orderNumber: order.id,
              itemCount: order.itemCount,
              totalCoins: order.totalCoins,
              remainingCoins: wallet.availableCoins,
            };
          } catch (error) {
            if (error instanceof CartApiError && error.status === 402) return { status: "insufficient" };
            if (error instanceof CartApiError && error.status === 409) return { status: "price-changed" };
            if (error instanceof CartApiError && error.status === 400) return { status: "fulfillment-invalid" };
            if (error instanceof CartApiError && error.status === 401) return { status: "auth-required" };
            return { status: "busy" };
          }
        }
        return { status: "auth-required" };
      },
      async signInWithEmail(email) {
        void email;
        const message = "Email-вход не подключён к серверу. Для покупок используйте Steam.";
        setNotice(message);
        return { ok: false, message };
      },
      async saveSteamTradeUrl(value) {
        const normalized = normalizeSteamTradeUrl(value);
        if (!normalized) return false;
        if (isServerBacked) {
          try {
            await ensureCsrfToken();
            await createApiClient({ csrfToken: () => csrfTokenRef.current }).putSteamTradeUrl(normalized);
            setSteamTradeUrl("");
            setServerSteamTradeUrlConfigured(true);
            return true;
          } catch {
            setNotice("Не удалось сохранить Steam Trade URL на сервере. Проверьте сессию и повторите действие.");
            return false;
          }
        }
        setNotice("Steam Trade URL сохраняется только в серверной Steam-сессии.");
        return false;
      },
      async sellInventoryItem(itemId) {
        void itemId;
        setNotice("Выкуп предметов сайтом отключён: для этой операции нет утверждённого способа оценки и расчёта.");
        return false;
      },
      async withdrawInventoryItem(itemId) {
        if (isServerBacked) {
          if (!exposedHydrated) { setNotice("Данные аккаунта ещё загружаются. Повторите действие через секунду."); return false; }
          try {
            await ensureCsrfToken();
            const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const client = createApiClient({ csrfToken: () => csrfTokenRef.current });
            await client.createInventoryWithdrawal({
              idempotencyKey: `withdraw-${uniqueId}`,
              itemId,
            });
            const [inventory, tradeHistory] = await Promise.all([
              client.getInventory(),
              client.getFulfillmentTradeHistory(),
            ]);
            setInventoryItems(inventory);
            setTradeEvents(tradeHistory);
            setNotice("Заявка на вывод создана. Статус доступен в логе Steam Trade.");
            return true;
          } catch {
            setNotice("Не удалось создать заявку на вывод. Проверьте Steam Trade URL и повторите действие.");
            return false;
          }
        }
        setNotice("Вывод предметов доступен только через серверную Steam-сессию.");
        return false;
      },
      async signOut() {
        if (isServerBacked) {
          try {
            await ensureCsrfToken();
            await createApiClient({ csrfToken: () => csrfTokenRef.current }).logout();
            csrfTokenRef.current = null;
            setServerSyncStatus("fallback");
            setServerCart(null);
            setInventoryItems([]);
            setTradeEvents([]);
            setServerSteamTradeUrlConfigured(false);
          } catch {
            setNotice("Не удалось завершить серверную сессию. Повторите действие.");
            return false;
          }
        }
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
      accountInventoryItems,
      balanceCoins,
      accountKey,
      applyServerCart,
      canPurchase,
      cart,
      cartSummary,
      ensureCsrfToken,
      exposedHydrated,
      hasSteam,
      hasSteamTradeUrl,
      hasSeedData,
      isAuthenticated,
      isHydrated,
      isServerBacked,
      marketplaceRevision,
      notice,
      orders,
      persistCurrentState,
      requiresSteam,
      serverCart,
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
