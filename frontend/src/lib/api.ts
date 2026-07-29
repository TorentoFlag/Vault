import openApiDocument from "../generated/api-contract.json" with { type: "json" };
import type { MarketplaceOrder, OrderDeliveryStatus, OrderStatus } from "../types/account.ts";
import type { Product } from "../types/commerce.ts";

type ServerApiPath = keyof typeof openApiDocument.paths;

export const apiPaths = [
  "/session/me",
  "/session/csrf",
  "/session/logout",
  "/me/steam-trade-url",
  "/me/steam-trade-url/status",
  "/wallet/me",
  "/catalog",
  "/catalog/{slug}",
  "/cart",
  "/cart/items/{productSlug}",
  "/checkout",
  "/checkout/cart",
  "/orders/me",
  "/inventory/me",
  "/payments/top-up/sessions",
] as const satisfies readonly ServerApiPath[];

type ApiPath = typeof apiPaths[number];

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
};

export type ApiUser = {
  id: string;
  steam: {
    connected: true;
    steamId64: string;
  };
};

export type ApiSteamTradeUrlStatus = {
  configured: boolean;
};

export type ApiWalletBalance = {
  postedCoins: number;
  heldCoins: number;
  availableCoins: number;
};

export type ApiTopUpSession = {
  id: string;
  status: "provider_configuration_required" | "provider_creation_pending" | "checkout_pending" | "paid" | "failed";
  provider: "arc_pay";
  coinAmountMinor: number;
  fiatAmountMinor: number;
  fiatCurrency: "RUB";
  checkoutUrl: string | null;
};

type ApiOrderRecipientSnapshot =
  | {
    kind: "steam-trade";
    steamId64: string;
    steamTradePartnerAccountId: string;
  }
  | {
    kind: "steam-refill";
    steamLogin: string;
  };

type ApiOrderLine = {
  id: string;
  productSlug: string;
  kind: Product["kind"];
  title: string;
  quantity: 1;
  unitPriceCoinMinor: number;
  recipientSnapshot: ApiOrderRecipientSnapshot;
};

type ApiOrderStatus = "failed" | "fulfilled" | "held" | "manual_review" | "partially_fulfilled";

type ApiOrder = {
  id: string;
  userId: string;
  status: ApiOrderStatus;
  totalCoinMinor: number;
  recipientSnapshots: ApiOrderRecipientSnapshot[];
  createdAt: string;
  lines: ApiOrderLine[];
};

type ApiInventoryAction = {
  enabled: false;
  reason: "not_supported";
};

type ApiInventoryItem = {
  actions: {
    sellToSite: ApiInventoryAction;
    withdrawToSteam: ApiInventoryAction;
  };
  acquiredAt: string;
  id: string;
  orderId: string;
  productSlug: string;
  status: "owned";
  title: string;
  unitPriceCoinMinor: number;
};

export type ApiMappedInventoryItem = {
  actions: ApiInventoryItem["actions"];
  acquiredAt: string;
  id: string;
  orderId: string;
  priceCoins: number;
  productId: string;
  slug: string;
  status: "owned";
  title: string;
};

export class ApiProblemError extends Error {
  readonly problem: ApiProblem;

  constructor(problem: ApiProblem) {
    super(problem.detail);
    this.name = "ApiProblemError";
    this.problem = problem;
  }
}

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiClientOptions = {
  baseUrl?: string;
  csrfToken?: () => string | null;
  fetch?: ApiFetch;
};

function defaultBaseOrigin(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
    ?? process.env.VAULT_API_BASE_URL;
  if (configuredBaseUrl) return new URL(configuredBaseUrl).origin;
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

export function buildApiUrl(path: ApiPath, baseUrl?: string): URL {
  const base = new URL(baseUrl ?? defaultBaseOrigin());
  return new URL(path, base.origin);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isApiProblem(value: unknown): value is ApiProblem {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number" &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    typeof value.requestId === "string"
  );
}

export function isApiUser(value: unknown): value is ApiUser {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("id") || !keys.includes("steam")) return false;
  if (typeof value.id !== "string") return false;
  if (!isRecord(value.steam)) return false;
  const steamKeys = Object.keys(value.steam);
  return (
    steamKeys.length === 2 &&
    steamKeys.includes("connected") &&
    steamKeys.includes("steamId64") &&
    value.steam.connected === true &&
    typeof value.steam.steamId64 === "string" &&
    /^(?:0|[1-9][0-9]{0,19})$/.test(value.steam.steamId64)
  );
}

function isWalletBalanceResponse(value: unknown): value is {
  postedCoinMinor: number;
  heldCoinMinor: number;
  availableCoinMinor: number;
} {
  if (!isRecord(value)) return false;
  return (
    typeof value.postedCoinMinor === "number" &&
    Number.isSafeInteger(value.postedCoinMinor) &&
    value.postedCoinMinor >= 0 &&
    typeof value.heldCoinMinor === "number" &&
    Number.isSafeInteger(value.heldCoinMinor) &&
    value.heldCoinMinor >= 0 &&
    typeof value.availableCoinMinor === "number" &&
    Number.isSafeInteger(value.availableCoinMinor) &&
    value.availableCoinMinor >= 0
  );
}

function isApiOrderRecipientSnapshot(value: unknown): value is ApiOrderRecipientSnapshot {
  if (!isRecord(value)) return false;
  if (value.kind === "steam-trade") {
    return typeof value.steamId64 === "string"
      && typeof value.steamTradePartnerAccountId === "string"
      && !("token" in value)
      && !("tradeUrl" in value);
  }
  return value.kind === "steam-refill" && typeof value.steamLogin === "string";
}

function isApiOrderLine(value: unknown): value is ApiOrderLine {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.productSlug === "string" &&
    (value.kind === "skins" || value.kind === "steam") &&
    typeof value.title === "string" &&
    value.quantity === 1 &&
    typeof value.unitPriceCoinMinor === "number" &&
    Number.isSafeInteger(value.unitPriceCoinMinor) &&
    value.unitPriceCoinMinor > 0 &&
    isApiOrderRecipientSnapshot(value.recipientSnapshot)
  );
}

function isApiOrderStatus(value: unknown): value is ApiOrderStatus {
  return value === "held" ||
    value === "fulfilled" ||
    value === "partially_fulfilled" ||
    value === "failed" ||
    value === "manual_review";
}

function isApiOrder(value: unknown): value is ApiOrder {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.userId === "string" &&
    isApiOrderStatus(value.status) &&
    typeof value.totalCoinMinor === "number" &&
    Number.isSafeInteger(value.totalCoinMinor) &&
    value.totalCoinMinor > 0 &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.recipientSnapshots) &&
    value.recipientSnapshots.every(isApiOrderRecipientSnapshot) &&
    Array.isArray(value.lines) &&
    value.lines.every(isApiOrderLine) &&
    !("idempotencyKey" in value) &&
    !("requestHash" in value)
  );
}

function isOrderHistoryResponse(value: unknown): value is { orders: ApiOrder[] } {
  return isRecord(value) && Array.isArray(value.orders) && value.orders.every(isApiOrder);
}

function isApiInventoryAction(value: unknown): value is ApiInventoryAction {
  return isRecord(value) && value.enabled === false && value.reason === "not_supported";
}

function isApiInventoryItem(value: unknown): value is ApiInventoryItem {
  if (!isRecord(value) || !isRecord(value.actions)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.orderId === "string" &&
    typeof value.productSlug === "string" &&
    typeof value.title === "string" &&
    typeof value.unitPriceCoinMinor === "number" &&
    Number.isSafeInteger(value.unitPriceCoinMinor) &&
    value.unitPriceCoinMinor > 0 &&
    typeof value.acquiredAt === "string" &&
    value.status === "owned" &&
    isApiInventoryAction(value.actions.sellToSite) &&
    isApiInventoryAction(value.actions.withdrawToSteam)
  );
}

function isInventoryResponse(value: unknown): value is { items: ApiInventoryItem[] } {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isApiInventoryItem);
}

function isTopUpSessionResponse(value: unknown): value is ApiTopUpSession {
  const validStatus = isRecord(value) && (
    value.status === "provider_configuration_required" ||
    value.status === "provider_creation_pending" ||
    value.status === "checkout_pending" ||
    value.status === "paid" ||
    value.status === "failed"
  );
  return isRecord(value) &&
    typeof value.id === "string" &&
    validStatus &&
    value.provider === "arc_pay" &&
    typeof value.coinAmountMinor === "number" &&
    Number.isSafeInteger(value.coinAmountMinor) &&
    value.coinAmountMinor > 0 &&
    typeof value.fiatAmountMinor === "number" &&
    Number.isSafeInteger(value.fiatAmountMinor) &&
    value.fiatAmountMinor > 0 &&
    value.fiatCurrency === "RUB" &&
    (value.checkoutUrl === null || typeof value.checkoutUrl === "string");
}

function coinMinorToCoins(amountMinor: number) {
  return amountMinor / 100;
}

function orderNumberFromId(id: string) {
  return `VLT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function fulfillmentModeForKind(kind: Product["kind"]): Product["fulfillmentMode"] {
  return kind === "skins" ? "steam-trade" : "automatic";
}

function deliveryStatusForStatus(status: ApiOrder["status"]): OrderDeliveryStatus {
  if (status === "fulfilled") return "delivered";
  if (status === "failed") return "failed";
  if (status === "manual_review" || status === "partially_fulfilled") return "needs-review";
  return "pending";
}

function orderStatusForApiStatus(status: ApiOrder["status"]): OrderStatus {
  if (status === "fulfilled") return "completed";
  if (status === "failed") return "failed";
  if (status === "manual_review" || status === "partially_fulfilled") return "needs_review";
  return "processing";
}

function mapApiOrder(order: ApiOrder): MarketplaceOrder {
  const steamRefillRecipient = order.recipientSnapshots.find((snapshot) => snapshot.kind === "steam-refill");
  return {
    id: order.id,
    number: orderNumberFromId(order.id),
    createdAt: order.createdAt,
    totalCoins: coinMinorToCoins(order.totalCoinMinor),
    status: orderStatusForApiStatus(order.status),
    isDemo: false,
    ...(steamRefillRecipient?.kind === "steam-refill" ? { recipient: { steamLogin: steamRefillRecipient.steamLogin } } : {}),
    items: order.lines.map((line) => ({
      id: line.id,
      productId: line.productSlug,
      slug: line.productSlug,
      title: line.title,
      kind: line.kind,
      priceCoins: coinMinorToCoins(line.unitPriceCoinMinor),
      fulfillmentMode: fulfillmentModeForKind(line.kind),
      deliveryStatus: deliveryStatusForStatus(order.status),
    })),
  };
}

function mapApiInventoryItem(item: ApiInventoryItem): ApiMappedInventoryItem {
  return {
    actions: item.actions,
    acquiredAt: item.acquiredAt,
    id: item.id,
    orderId: item.orderId,
    priceCoins: coinMinorToCoins(item.unitPriceCoinMinor),
    productId: item.productSlug,
    slug: item.productSlug,
    status: item.status,
    title: item.title,
  };
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;

  async function requestJson(path: ApiPath, init: RequestInit = {}): Promise<unknown> {
    const method = init.method?.toUpperCase() ?? "GET";
    const headers: Record<string, string> = {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    if (method !== "GET" && method !== "HEAD") {
      const token = options.csrfToken?.();
      if (token) headers["x-csrf-token"] = token;
    }

    const response = await fetchImpl(buildApiUrl(path, options.baseUrl), {
      ...init,
      method,
      headers,
      credentials: "include",
    });
    const body = await parseJson(response);
    if (!response.ok) {
      throw new ApiProblemError(isApiProblem(body)
        ? body
        : {
            type: "https://vault.local/problems/http-error",
            title: "Request failed",
            status: response.status,
            code: "HTTP_ERROR",
            detail: "API request failed.",
            requestId: response.headers.get("x-request-id") ?? "",
          });
    }
    return body;
  }

  return {
    async getCurrentUser(): Promise<ApiUser> {
      const body = await requestJson("/session/me");
      if (!isApiUser(body)) throw new Error("Session response is malformed.");
      return body;
    },

    async getCsrfToken(): Promise<string> {
      const body = await requestJson("/session/csrf");
      if (!isRecord(body) || typeof body.token !== "string") throw new Error("CSRF response is malformed.");
      return body.token;
    },

    async logout(): Promise<void> {
      await requestJson("/session/logout", { method: "POST" });
    },

    async putSteamTradeUrl(tradeUrl: string): Promise<ApiSteamTradeUrlStatus> {
      const body = await requestJson("/me/steam-trade-url", {
        method: "PUT",
        body: JSON.stringify({ tradeUrl }),
      });
      if (!isRecord(body) || body.configured !== true) throw new Error("Steam Trade URL response is malformed.");
      return { configured: true };
    },

    async getSteamTradeUrlStatus(): Promise<ApiSteamTradeUrlStatus> {
      const body = await requestJson("/me/steam-trade-url/status");
      if (!isRecord(body) || typeof body.configured !== "boolean") throw new Error("Steam Trade URL status is malformed.");
      return { configured: body.configured };
    },

    async getWalletBalance(): Promise<ApiWalletBalance> {
      const body = await requestJson("/wallet/me");
      if (!isWalletBalanceResponse(body)) throw new Error("Wallet balance response is malformed.");
      return {
        postedCoins: coinMinorToCoins(body.postedCoinMinor),
        heldCoins: coinMinorToCoins(body.heldCoinMinor),
        availableCoins: coinMinorToCoins(body.availableCoinMinor),
      };
    },

    async getOrderHistory(): Promise<MarketplaceOrder[]> {
      const body = await requestJson("/orders/me");
      if (!isOrderHistoryResponse(body)) throw new Error("Order history response is malformed.");
      return body.orders.map(mapApiOrder);
    },

    async getInventory(): Promise<ApiMappedInventoryItem[]> {
      const body = await requestJson("/inventory/me");
      if (!isInventoryResponse(body)) throw new Error("Inventory response is malformed.");
      return body.items.map(mapApiInventoryItem);
    },

    async createTopUpSession(input: { coinAmountMinor: number; idempotencyKey: string }): Promise<ApiTopUpSession> {
      const body = await requestJson("/payments/top-up/sessions", {
        method: "POST",
        headers: {
          "idempotency-key": input.idempotencyKey,
        },
        body: JSON.stringify({ coinAmountMinor: input.coinAmountMinor }),
      });
      if (!isTopUpSessionResponse(body)) throw new Error("Top-up session response is malformed.");
      return body;
    },
  };
}
