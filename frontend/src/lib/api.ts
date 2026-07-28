import openApiDocument from "../generated/api-contract.json" with { type: "json" };

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

function coinMinorToCoins(amountMinor: number) {
  return amountMinor / 100;
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
  };
}
