import type {
  SihCatalogGame,
  SihSteamCheckResult,
  SihSteamPayResult,
  SihSupplierItem,
} from "./sih.types";

const MAX_ITEM_COUNT = 1_000_000_000;
const MAX_MARKET_HASH_NAME_LENGTH = 512;
const TRUSTED_IMAGE_HOSTS = new Set([
  "cdn.cloudflare.steamstatic.com",
  "community.cloudflare.steamstatic.com",
  "steamcommunity-a.akamaihd.net",
]);

function invalid(): never {
  throw new Error("SIH_RESPONSE_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength || value.trim() !== value) invalid();
  return value;
}

function optionalTrustedImage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return null;
  if (/^[A-Za-z0-9_-]{20,1024}$/.test(value)) {
    return `https://community.cloudflare.steamstatic.com/economy/image/${value}`;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !TRUSTED_IMAGE_HOSTS.has(url.hostname) ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_ITEM_COUNT) invalid();
  return value;
}

function decimalMinor(value: unknown, scale: number, options: { allowZero?: true } = {}): bigint {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (value === 0 && options.allowZero !== true)) invalid();
  const normalized = value.toString();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(normalized);
  if (match === null) invalid();
  const whole = match[1];
  if (whole === undefined) invalid();
  const fraction = (match[2] ?? "").slice(0, scale).padEnd(scale, "0");
  return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction || "0");
}

function parseJson(rawPayload: string): unknown {
  try {
    return JSON.parse(rawPayload) as unknown;
  } catch {
    invalid();
  }
}

export function sihAppId(game: SihCatalogGame): number {
  switch (game) {
    case "cs2":
      return 730;
    case "rust":
      return 252490;
    case "tf2":
      return 440;
  }
}

export function parseSihItems(rawPayload: string, game: SihCatalogGame): SihSupplierItem[] {
  const payload = parseJson(rawPayload);
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.items)) invalid();
  return Object.entries(payload.items).map(([marketHashName, item]) => {
    if (!isRecord(item)) invalid();
    return {
      availableQuantity: integer(item.count),
      game,
      imageUrl: optionalTrustedImage(item.image),
      marketHashName: canonicalText(marketHashName, MAX_MARKET_HASH_NAME_LENGTH),
      priceMicrousd: decimalMinor(item.price, 6),
    };
  });
}

export function parseSihMinimumItem(rawPayload: string, game: SihCatalogGame, expectedMarketHashName: string): SihSupplierItem | null {
  const items = parseSihItems(rawPayload, game);
  if (items.length === 0) return null;
  if (items.length !== 1 || items[0]?.marketHashName !== expectedMarketHashName) invalid();
  return items[0];
}

export function parseSihSteamCheck(rawPayload: string): SihSteamCheckResult {
  const payload = parseJson(rawPayload);
  if (!isRecord(payload) || payload.success !== true) invalid();
  const transactionId = canonicalText(payload.transactionId, 100);
  if (transactionId.length < 10) invalid();
  return { transactionId };
}

export function parseSihSteamPay(rawPayload: string): SihSteamPayResult {
  const payload = parseJson(rawPayload);
  if (!isRecord(payload) || payload.status !== "success") invalid();
  return {
    cashbackUsd: decimalMinor(payload.cashback, 6, { allowZero: true }),
    paymentAmountRub: decimalMinor(payload.paymentAmount, 2),
    status: "success",
  };
}
