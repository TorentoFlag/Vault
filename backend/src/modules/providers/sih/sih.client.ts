import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  cancelBody,
  classifyHttpFailure,
  hasJsonContentType,
  readBoundedBody,
  retryAfterMs,
} from "./sih-http";
import {
  parseSihItems,
  parseSihMinimumItem,
  parseSihSteamCheck,
  parseSihSteamPay,
  sihAppId,
} from "./sih-contract";
import type {
  SihCatalogGame,
  SihFailureDisposition,
  SihSteamCheckResult,
  SihSteamPayResult,
  SihSupplierItem,
} from "./sih.types";

export type SihFetch = (input: URL, init?: RequestInit) => Promise<Response>;

export type SihClientOptions = {
  apiKeyFile?: string;
  fetcher?: SihFetch;
  marketBaseUrl: string;
  maximumBodyBytes: number;
  requestTimeoutMs: number;
  steamRefillBaseUrl: string;
};

export type GetItemsCommand = {
  game: SihCatalogGame;
};

export type GetMinimumItemCommand = {
  game: SihCatalogGame;
  marketHashName: string;
};

export type CheckSteamAccountCommand = {
  steamUsername: string;
};

export type PaySteamRefillCommand = {
  amountRub: number;
  steamUsername: string;
  transactionId: string;
};

export class SihProviderError extends Error {
  constructor(
    readonly disposition: SihFailureDisposition,
    readonly code: string,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "SihProviderError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateOptions(options: SihClientOptions): void {
  if (
    options.maximumBodyBytes < 1_024 ||
    !Number.isSafeInteger(options.maximumBodyBytes) ||
    options.requestTimeoutMs < 500 ||
    !Number.isSafeInteger(options.requestTimeoutMs) ||
    !URL.canParse(options.marketBaseUrl) ||
    !URL.canParse(options.steamRefillBaseUrl)
  ) {
    throw new Error("SIH_CLIENT_OPTIONS_INVALID");
  }
}

function sanitizeSteamUsername(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 64) throw new Error("SIH_STEAM_USERNAME_INVALID");
  return normalized;
}

function sanitizeMarketHashName(value: string): string {
  if (value.length === 0 || value.length > 512 || value.trim() !== value) throw new Error("SIH_ITEM_IDENTITY_INVALID");
  return value;
}

export class SihClient {
  private readonly fetcher: SihFetch;

  constructor(private readonly options: SihClientOptions) {
    validateOptions(options);
    this.fetcher = options.fetcher ?? fetch;
  }

  async getItems(command: GetItemsCommand): Promise<SihSupplierItem[]> {
    const url = new URL("/api/v1/get-items", this.options.marketBaseUrl);
    url.searchParams.set("appId", String(sihAppId(command.game)));
    url.searchParams.set("minified", "false");
    url.searchParams.set("extended", "true");
    const payload = await this.getJson(url, "market");
    try {
      return parseSihItems(payload, command.game);
    } catch (error) {
      throw new SihProviderError("retryable", "SIH_CONTRACT_SUSPECT", undefined, { cause: error });
    }
  }

  async getMinimumItem(command: GetMinimumItemCommand): Promise<SihSupplierItem | null> {
    const marketHashName = sanitizeMarketHashName(command.marketHashName);
    const url = new URL("/api/v1/get-min-item", this.options.marketBaseUrl);
    url.searchParams.set("item", marketHashName);
    url.searchParams.set("minified", "false");
    url.searchParams.set("appId", String(sihAppId(command.game)));
    const payload = await this.getJson(url, "market");
    try {
      return parseSihMinimumItem(payload, command.game, marketHashName);
    } catch (error) {
      throw new SihProviderError("retryable", "SIH_CONTRACT_SUSPECT", undefined, { cause: error });
    }
  }

  async checkSteamAccount(command: CheckSteamAccountCommand): Promise<SihSteamCheckResult> {
    const payload = await this.postJson(
      new URL("/p/api/v1.0/steam/check", this.options.steamRefillBaseUrl),
      "steam-refill",
      { steamUsername: sanitizeSteamUsername(command.steamUsername) },
    );
    try {
      return parseSihSteamCheck(payload);
    } catch (error) {
      throw new SihProviderError("retryable", "SIH_CONTRACT_SUSPECT", undefined, { cause: error });
    }
  }

  async paySteamRefill(command: PaySteamRefillCommand): Promise<SihSteamPayResult> {
    if (!Number.isInteger(command.amountRub) || command.amountRub < 50 || command.amountRub > 9_433) {
      throw new Error("SIH_STEAM_REFILL_AMOUNT_INVALID");
    }
    if (command.transactionId.length < 10 || command.transactionId.length > 100 || command.transactionId.trim() !== command.transactionId) {
      throw new Error("SIH_STEAM_TRANSACTION_INVALID");
    }
    const payload = await this.postJson(
      new URL("/p/api/v1.0/steam/pay", this.options.steamRefillBaseUrl),
      "steam-refill",
      {
        amount: command.amountRub,
        currency: "RUB",
        steamUsername: sanitizeSteamUsername(command.steamUsername),
        transactionId: command.transactionId,
      },
    );
    try {
      return parseSihSteamPay(payload);
    } catch (error) {
      throw new SihProviderError("retryable", "SIH_CONTRACT_SUSPECT", undefined, { cause: error });
    }
  }

  fingerprint(value: string): string {
    return sha256(value);
  }

  private async getJson(url: URL, header: "market" | "steam-refill"): Promise<string> {
    return this.requestJson(url, header, { method: "GET" });
  }

  private async postJson(url: URL, header: "market" | "steam-refill", body: unknown): Promise<string> {
    return this.requestJson(url, header, {
      body: JSON.stringify(body),
      method: "POST",
    });
  }

  private async requestJson(url: URL, header: "market" | "steam-refill", init: RequestInit): Promise<string> {
    const apiKey = await this.loadApiKey();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          accept: "application/json",
          ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
          [header === "market" ? "apikey" : "api-key"]: apiKey,
        },
        redirect: "error",
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (error) {
      throw new SihProviderError("retryable", "SIH_NETWORK_UNAVAILABLE", undefined, { cause: error });
    }
    if (!response.ok || response.status !== 200) {
      const classified = classifyHttpFailure(response.status);
      await cancelBody(response);
      throw new SihProviderError(classified.disposition, classified.code, retryAfterMs(response));
    }
    if (!hasJsonContentType(response)) {
      await cancelBody(response);
      throw new SihProviderError("retryable", "SIH_CONTRACT_SUSPECT");
    }
    return readBoundedBody(response, this.options.maximumBodyBytes);
  }

  private async loadApiKey(): Promise<string> {
    if (this.options.apiKeyFile === undefined) throw new SihProviderError("permanent", "SIH_CONFIGURATION_INVALID");
    try {
      const value = (await readFile(this.options.apiKeyFile, "utf8")).trim();
      if (value.length === 0 || value.length > 4_096) throw new Error("SIH_API_KEY_INVALID");
      return value;
    } catch (error) {
      throw new SihProviderError("permanent", "SIH_CONFIGURATION_INVALID", undefined, { cause: error });
    }
  }
}
