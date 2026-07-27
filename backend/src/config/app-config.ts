export type AppNodeEnv = "development" | "test" | "production";
export type ArcPayEnvironment = "sandbox" | "live";

export type AppConfig = {
  nodeEnv: AppNodeEnv;
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
  arcPay: {
    environment: ArcPayEnvironment;
    secretKeyFile?: string;
  };
  sih: {
    apiKeyFile?: string;
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

function parseArcPayEnvironment(value: string | undefined): ArcPayEnvironment {
  if (!value) return "sandbox";
  if (value === "sandbox" || value === "live") return value;
  throw new Error("ARC_PAY_ENVIRONMENT must be sandbox or live.");
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const databaseUrl = optionalString(env.DATABASE_URL);
  const redisUrl = optionalString(env.REDIS_URL);
  const arcPaySecretKeyFile = optionalString(env.ARC_PAY_SECRET_KEY_FILE);
  const sihApiKeyFile = optionalString(env.SIH_API_KEY_FILE);

  return {
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    port: parsePort(env.PORT),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(redisUrl ? { redisUrl } : {}),
    arcPay: {
      environment: parseArcPayEnvironment(env.ARC_PAY_ENVIRONMENT),
      ...(arcPaySecretKeyFile ? { secretKeyFile: arcPaySecretKeyFile } : {}),
    },
    sih: {
      ...(sihApiKeyFile ? { apiKeyFile: sihApiKeyFile } : {}),
    },
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
  };
}
