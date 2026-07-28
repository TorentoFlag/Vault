export type AppNodeEnv = "development" | "test" | "production";
export type ArcPayEnvironment = "sandbox" | "live";
export type ArcPayProviderMode = "disabled" | "fake" | "real";

export type AppConfig = {
  nodeEnv: AppNodeEnv;
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
  arcPay: {
    environment: ArcPayEnvironment;
    providerMode: ArcPayProviderMode;
    secretKeyFile?: string;
    fakeCheckoutBaseUrl?: string;
    publicOrigin?: string;
    webhookSigningSecretFile?: string;
  };
  sih: {
    apiKeyFile?: string;
    marketBaseUrl: string;
    maximumBodyBytes: number;
    requestTimeoutMs: number;
    steamRefillBaseUrl: string;
  };
  corsOrigins: string[];
};

function optionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseNodeEnv(value: string | undefined): AppNodeEnv {
  if (!value) return "development";
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error("NODE_ENV must be development, test, or production.");
}

function parsePort(value: string | undefined): number {
  const normalized = value?.trim() || "3000";
  if (!/^\d+$/.test(normalized)) throw new Error("PORT must be between 1 and 65535.");
  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be between 1 and 65535.");
  }
  return port;
}

function parseBoundedInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const normalized = value?.trim() || String(defaultValue);
  if (!/^\d+$/.test(normalized)) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function parseHttpsUrl(name: string, value: string | undefined, defaultValue: string): string {
  const normalized = value?.trim() || defaultValue;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

function parseArcPayEnvironment(value: string | undefined): ArcPayEnvironment {
  if (!value) return "sandbox";
  if (value === "sandbox" || value === "live") return value;
  throw new Error("ARC_PAY_ENVIRONMENT must be sandbox or live.");
}

function parseArcPayProviderMode(nodeEnv: AppNodeEnv, value: string | undefined): ArcPayProviderMode {
  const normalized = value?.trim() || "disabled";
  if (normalized !== "disabled" && normalized !== "fake" && normalized !== "real") {
    throw new Error("ARC_PAY_PROVIDER_MODE must be disabled, fake, or real.");
  }
  if (nodeEnv === "production" && normalized === "fake") {
    throw new Error("ARC_PAY_PROVIDER_MODE=fake is not allowed in production.");
  }
  return normalized;
}

function parseHttpOrHttpsBaseUrl(name: string, value: string | undefined): string | undefined {
  const normalized = optionalString(value);
  if (normalized === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

function parseHttpsOrigin(name: string, value: string | undefined): string | undefined {
  const normalized = optionalString(value);
  if (normalized === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  return url.origin;
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const databaseUrl = optionalString(env.DATABASE_URL);
  const redisUrl = optionalString(env.REDIS_URL);
  const arcPaySecretKeyFile = optionalString(env.ARC_PAY_SECRET_KEY_FILE);
  const arcPayProviderMode = parseArcPayProviderMode(nodeEnv, env.ARC_PAY_PROVIDER_MODE);
  const arcPayFakeCheckoutBaseUrl = parseHttpOrHttpsBaseUrl("ARC_PAY_FAKE_CHECKOUT_BASE_URL", env.ARC_PAY_FAKE_CHECKOUT_BASE_URL);
  const arcPayPublicOrigin = parseHttpsOrigin("ARC_PAY_PUBLIC_ORIGIN", env.ARC_PAY_PUBLIC_ORIGIN);
  const arcPayWebhookSigningSecretFile = optionalString(env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE);
  const sihApiKeyFile = optionalString(env.SIH_API_KEY_FILE);

  return {
    nodeEnv,
    port: parsePort(env.PORT),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(redisUrl ? { redisUrl } : {}),
    arcPay: {
      environment: parseArcPayEnvironment(env.ARC_PAY_ENVIRONMENT),
      providerMode: arcPayProviderMode,
      ...(arcPaySecretKeyFile ? { secretKeyFile: arcPaySecretKeyFile } : {}),
      ...(arcPayFakeCheckoutBaseUrl ? { fakeCheckoutBaseUrl: arcPayFakeCheckoutBaseUrl } : {}),
      ...(arcPayPublicOrigin ? { publicOrigin: arcPayPublicOrigin } : {}),
      ...(arcPayWebhookSigningSecretFile ? { webhookSigningSecretFile: arcPayWebhookSigningSecretFile } : {}),
    },
    sih: {
      ...(sihApiKeyFile ? { apiKeyFile: sihApiKeyFile } : {}),
      marketBaseUrl: parseHttpsUrl("SIH_MARKET_BASE_URL", env.SIH_MARKET_BASE_URL, "https://api.sih.market"),
      maximumBodyBytes: parseBoundedInteger("SIH_RESPONSE_MAX_BYTES", env.SIH_RESPONSE_MAX_BYTES, 16_777_216, 1_024, 16_777_216),
      requestTimeoutMs: parseBoundedInteger("SIH_REQUEST_TIMEOUT_MS", env.SIH_REQUEST_TIMEOUT_MS, 60_000, 500, 120_000),
      steamRefillBaseUrl: parseHttpsUrl("SIH_STEAM_REFILL_BASE_URL", env.SIH_STEAM_REFILL_BASE_URL, "https://core.steaminventoryhelper.com"),
    },
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  };
}
