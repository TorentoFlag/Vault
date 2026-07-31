import type { Product } from "../types/commerce.ts";

import { fetchCatalogProductBySlug } from "./catalog-api.ts";

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiCartItem = {
  productId: string;
  productSlug: string;
  kind: "skins" | "steam";
  title: string;
  quantity: number;
  unitPriceCoinMinor: number;
  lineTotalCoinMinor: number;
  recipient: Record<string, unknown>;
};

type ApiCart = {
  items: ApiCartItem[];
  totalCoinMinor: number;
};

export type ServerCartItem = {
  productId: string;
  productSlug: string;
  kind: "skins" | "steam";
  title: string;
  quantity: number;
  unitPriceCoins: number;
  lineTotalCoins: number;
  recipient: Record<string, unknown>;
};

export type ServerCart = {
  items: ServerCartItem[];
  totalCoins: number;
};

export type ServerCartProduct = Product & {
  cartQuantity: number;
  cartUnitPriceCoins: number;
  cartLineTotalCoins: number;
  cartRecipient: Record<string, unknown>;
};

export type HydratedServerCart = ServerCart & {
  products: ServerCartProduct[];
};

export type CartApiOptions = {
  baseUrl?: string;
  fetch?: ApiFetch;
  csrfToken?: () => string | null;
};

export type SetServerCartItemInput = {
  quantity: number;
  recipient?: {
    steamLogin?: string;
  };
};

export type CheckoutServerCartInput = {
  acceptedTotalCoinMinor: number;
  idempotencyKey: string;
};

export type ServerCartCheckout = {
  id: string;
  userId: string;
  status: "held";
  totalCoins: number;
  itemCount: number;
};

export class CartApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Cart API request failed with status ${status}.`);
    this.name = "CartApiError";
    this.status = status;
    this.body = body;
  }
}

function defaultApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL
    ?? process.env.VAULT_API_BASE_URL
    ?? (typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
}

function buildApiUrl(path: string, baseUrl?: string) {
  const base = new URL(baseUrl ?? defaultApiBaseUrl());
  return new URL(path, base.origin);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isApiCartItem(value: unknown): value is ApiCartItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.productId === "string"
    && typeof value.productSlug === "string"
    && (value.kind === "skins" || value.kind === "steam")
    && typeof value.title === "string"
    && isSafePositiveInteger(value.quantity)
    && value.quantity <= 50
    && isSafePositiveInteger(value.unitPriceCoinMinor)
    && isSafePositiveInteger(value.lineTotalCoinMinor)
    && isRecord(value.recipient)
  );
}

function isApiCart(value: unknown): value is ApiCart {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isApiCartItem)
    && typeof value.totalCoinMinor === "number"
    && Number.isSafeInteger(value.totalCoinMinor)
    && value.totalCoinMinor >= 0;
}

function minorToCoins(amountMinor: number) {
  return amountMinor / 100;
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

async function requestJson(path: string, options: CartApiOptions = {}, init: RequestInit = {}): Promise<unknown> {
  const method = init.method?.toUpperCase() ?? "GET";
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD") {
    const token = options.csrfToken?.();
    if (token) headers["x-csrf-token"] = token;
  }

  const response = await (options.fetch ?? fetch)(buildApiUrl(path, options.baseUrl), {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: method === "GET" ? "no-store" : init.cache,
  });
  const body = await parseJson(response);
  if (!response.ok) throw new CartApiError(response.status, body);
  return body;
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function normalizeRecipient(recipient: SetServerCartItemInput["recipient"]) {
  const steamLogin = recipient?.steamLogin?.trim();
  return steamLogin ? { steamLogin } : {};
}

function mapCartItem(item: ApiCartItem): ServerCartItem {
  return {
    productId: item.productId,
    productSlug: item.productSlug,
    kind: item.kind,
    title: item.title,
    quantity: item.quantity,
    unitPriceCoins: minorToCoins(item.unitPriceCoinMinor),
    lineTotalCoins: minorToCoins(item.lineTotalCoinMinor),
    recipient: item.recipient,
  };
}

export function mapApiCart(value: unknown): ServerCart {
  if (!isApiCart(value)) throw new Error("Cart response is malformed.");
  return {
    items: value.items.map(mapCartItem),
    totalCoins: minorToCoins(value.totalCoinMinor),
  };
}

async function hydrateCart(cart: ServerCart, options: CartApiOptions = {}): Promise<HydratedServerCart> {
  const products = await Promise.all(cart.items.map(async (item) => {
    const product = await fetchCatalogProductBySlug(item.productSlug, {
      baseUrl: options.baseUrl,
      fetch: options.fetch,
    });
    if (!product) throw new Error("Cart product catalog response is missing.");
    return {
      ...product,
      id: item.productId,
      slug: item.productSlug,
      kind: item.kind,
      title: item.title,
      priceCoins: item.lineTotalCoins,
      cartQuantity: item.quantity,
      cartUnitPriceCoins: item.unitPriceCoins,
      cartLineTotalCoins: item.lineTotalCoins,
      cartRecipient: item.recipient,
    };
  }));

  return {
    ...cart,
    products,
  };
}

export async function fetchServerCart(options: CartApiOptions = {}): Promise<ServerCart> {
  return mapApiCart(await requestJson("/cart", options));
}

export async function fetchHydratedCart(options: CartApiOptions = {}): Promise<HydratedServerCart> {
  return hydrateCart(await fetchServerCart(options), options);
}

export async function setServerCartItem(
  productSlug: string,
  input: SetServerCartItemInput,
  options: CartApiOptions = {},
): Promise<HydratedServerCart> {
  const quantity = Math.max(1, Math.min(50, Math.floor(input.quantity)));
  const recipient = normalizeRecipient(input.recipient);
  const body = Object.keys(recipient).length
    ? { quantity, recipient }
    : { quantity };
  const cart = mapApiCart(await requestJson(`/cart/items/${encodePathSegment(productSlug)}`, options, {
    method: "PUT",
    body: JSON.stringify(body),
  }));
  return hydrateCart(cart, options);
}

export async function removeServerCartItem(productSlug: string, options: CartApiOptions = {}): Promise<HydratedServerCart> {
  const cart = mapApiCart(await requestJson(`/cart/items/${encodePathSegment(productSlug)}`, options, {
    method: "DELETE",
  }));
  return hydrateCart(cart, options);
}

export async function clearServerCart(options: CartApiOptions = {}): Promise<HydratedServerCart> {
  const cart = mapApiCart(await requestJson("/cart", options, {
    method: "DELETE",
  }));
  return hydrateCart(cart, options);
}

function isCheckoutResponse(value: unknown): value is {
  id: string;
  userId: string;
  status: "held";
  totalCoinMinor: number;
  lines: unknown[];
} {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.userId === "string"
    && value.status === "held"
    && isSafePositiveInteger(value.totalCoinMinor)
    && Array.isArray(value.lines);
}

export async function checkoutServerCart(
  input: CheckoutServerCartInput,
  options: CartApiOptions = {},
): Promise<ServerCartCheckout> {
  const body = await requestJson("/checkout/cart", options, {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ acceptedTotalCoinMinor: input.acceptedTotalCoinMinor }),
  });
  if (!isCheckoutResponse(body)) throw new Error("Checkout response is malformed.");
  return {
    id: body.id,
    userId: body.userId,
    status: body.status,
    totalCoins: minorToCoins(body.totalCoinMinor),
    itemCount: body.lines.length,
  };
}
