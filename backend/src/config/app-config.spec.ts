import { describe, expect, it } from "vitest";

import { loadAppConfig } from "./app-config";

describe("loadAppConfig", () => {
  it("parses runtime urls, secret-file paths, and CORS origins without exposing secret values", () => {
    expect(loadAppConfig({
      NODE_ENV: "test",
      PORT: "4100",
      DATABASE_URL: "postgres://vault:test@localhost:5432/vault",
      REDIS_URL: "redis://localhost:6379/0",
      ARC_PAY_ENVIRONMENT: "sandbox",
      ARC_PAY_SECRET_KEY_FILE: "/run/secrets/arc-pay-secret",
      SIH_API_KEY_FILE: "/run/secrets/sih-api-key",
      CORS_ORIGINS: "https://vault.example, https://admin.vault.example",
    })).toEqual({
      nodeEnv: "test",
      port: 4100,
      databaseUrl: "postgres://vault:test@localhost:5432/vault",
      redisUrl: "redis://localhost:6379/0",
      arcPay: {
        environment: "sandbox",
        secretKeyFile: "/run/secrets/arc-pay-secret",
      },
      sih: {
        apiKeyFile: "/run/secrets/sih-api-key",
      },
      corsOrigins: ["https://vault.example", "https://admin.vault.example"],
    });
  });

  it("fails closed on invalid ports and Arc Pay environments", () => {
    expect(() => loadAppConfig({ PORT: "0" })).toThrow("PORT must be between 1 and 65535.");
    expect(() => loadAppConfig({ ARC_PAY_ENVIRONMENT: "qa" })).toThrow("ARC_PAY_ENVIRONMENT must be sandbox or live.");
  });
});
