import { optionalString, optionalStringFromFile } from "./secret-file";
import { parseCatalogPublicGames, type CatalogGame } from "../modules/catalog/catalog-game";

export type AppNodeEnv = "development" | "test" | "production";
export type ArcPayEnvironment = "sandbox" | "live";
export type ArcPayProviderMode = "disabled" | "fake" | "real";

export type AppConfig = {
  nodeEnv: AppNodeEnv;
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
  admin: {
    apiTokenFile?: string;
  };
  steam: {
    webApiKeyFile?: string;
  };
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
    steamRefillApiKeyFile?: string;
    steamRefillBaseUrl: string;
  };
  catalog: {
    publicGames: CatalogGame[];
  };
  notifications: {
    resendApiKeyFile?: string;
    resendFrom?: string;
    resendWebhookSecretFile?: string;
    slackAppleOrdersWebhookUrlFile?: string;
    appleGiftCardEncryptionKeyFile?: string;
  };
  integration: {
    publicOrigin: string;
    adminOrigin: string;
    vvAdminWebhookUrl?: string;
    vvAdminSiteKey?: string;
    vvAdminWebhookSecretFile?: string;
    scenarioAuthSecretFile?: string;
  };
  corsOrigins: string[];
};

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

function parseHttpsPublicBaseUrl(name: string, value: string | undefined): string | undefined {
  const normalized = optionalString(value);
  if (normalized === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS base URL.`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error(`${name} must be a valid HTTPS base URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const databaseUrl = optionalString(env.DATABASE_URL) ?? optionalStringFromFile(env.DATABASE_URL_FILE);
  const redisUrl = optionalString(env.REDIS_URL);
  const arcPaySecretKeyFile = optionalString(env.ARC_PAY_SECRET_KEY_FILE);
  const arcPayProviderMode = parseArcPayProviderMode(nodeEnv, env.ARC_PAY_PROVIDER_MODE);
  const arcPayFakeCheckoutBaseUrl = parseHttpOrHttpsBaseUrl("ARC_PAY_FAKE_CHECKOUT_BASE_URL", env.ARC_PAY_FAKE_CHECKOUT_BASE_URL);
  const arcPayPublicOrigin = parseHttpsPublicBaseUrl("ARC_PAY_PUBLIC_ORIGIN", env.ARC_PAY_PUBLIC_ORIGIN);
  const arcPayWebhookSigningSecretFile = optionalString(env.ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE);
  const steamWebApiKeyFile = optionalString(env.STEAM_WEB_API_KEY_FILE);
  const sihApiKeyFile = optionalString(env.SIH_API_KEY_FILE);
  const sihSteamRefillApiKeyFile = optionalString(env.SIH_STEAM_REFILL_API_KEY_FILE);
  const adminApiTokenFile = optionalString(env.ADMIN_API_TOKEN_FILE);
  const resendApiKeyFile = optionalString(env.RESEND_API_KEY_FILE);
  const resendFrom = optionalString(env.RESEND_FROM);
  const resendWebhookSecretFile = optionalString(env.RESEND_WEBHOOK_SECRET_FILE);
  const slackAppleOrdersWebhookUrlFile = optionalString(env.SLACK_APPLE_ORDERS_WEBHOOK_URL_FILE);
  const appleGiftCardEncryptionKeyFile = optionalString(env.APPLE_GIFT_CARD_ENCRYPTION_KEY_FILE);
  const integrationPublicOrigin =
    parseHttpsPublicBaseUrl("VV_ADMIN_PUBLIC_ORIGIN", env.VV_ADMIN_PUBLIC_ORIGIN) ??
    "https://vault.example";
  const integrationAdminOrigin =
    parseHttpsPublicBaseUrl("VV_ADMIN_API_ORIGIN", env.VV_ADMIN_API_ORIGIN) ??
    integrationPublicOrigin;
  const vvAdminWebhookUrl = parseHttpsPublicBaseUrl(
    "VV_ADMIN_WEBHOOK_URL",
    env.VV_ADMIN_WEBHOOK_URL,
  );
  const vvAdminSiteKey = optionalString(env.VV_ADMIN_SITE_KEY);
  const vvAdminWebhookSecretFile = optionalString(
    env.VV_ADMIN_WEBHOOK_SECRET_FILE,
  );
  const scenarioAuthSecretFile = optionalString(env.VV_SCENARIO_AUTH_SECRET_FILE);

  if (nodeEnv === "production" && resendApiKeyFile !== undefined && resendFrom === undefined) {
    throw new Error("RESEND_FROM is required when RESEND_API_KEY_FILE is configured in production.");
  }

  return {
    nodeEnv,
    port: parsePort(env.PORT),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(redisUrl ? { redisUrl } : {}),
    admin: {
      ...(adminApiTokenFile ? { apiTokenFile: adminApiTokenFile } : {}),
    },
    steam: {
      ...(steamWebApiKeyFile ? { webApiKeyFile: steamWebApiKeyFile } : {}),
    },
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
      ...(sihSteamRefillApiKeyFile ? { steamRefillApiKeyFile: sihSteamRefillApiKeyFile } : {}),
      steamRefillBaseUrl: parseHttpsUrl("SIH_STEAM_REFILL_BASE_URL", env.SIH_STEAM_REFILL_BASE_URL, "https://core.steaminventoryhelper.com"),
    },
    catalog: {
      publicGames: parseCatalogPublicGames(env.CATALOG_PUBLIC_GAMES),
    },
    notifications: {
      ...(resendApiKeyFile ? { resendApiKeyFile } : {}),
      ...(resendFrom ? { resendFrom } : {}),
      ...(resendWebhookSecretFile ? { resendWebhookSecretFile } : {}),
      ...(slackAppleOrdersWebhookUrlFile ? { slackAppleOrdersWebhookUrlFile } : {}),
      ...(appleGiftCardEncryptionKeyFile ? { appleGiftCardEncryptionKeyFile } : {}),
    },
    integration: {
      publicOrigin: integrationPublicOrigin,
      adminOrigin: integrationAdminOrigin,
      ...(vvAdminWebhookUrl ? { vvAdminWebhookUrl } : {}),
      ...(vvAdminSiteKey ? { vvAdminSiteKey } : {}),
      ...(vvAdminWebhookSecretFile ? { vvAdminWebhookSecretFile } : {}),
      ...(scenarioAuthSecretFile ? { scenarioAuthSecretFile } : {}),
    },
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  };
}
