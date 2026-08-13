import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      ARC_PAY_PROVIDER_MODE: "fake",
      ARC_PAY_SECRET_KEY_FILE: "/run/secrets/arc-pay-secret",
      ARC_PAY_FAKE_CHECKOUT_BASE_URL: "http://localhost:3999",
      ARC_PAY_PUBLIC_ORIGIN: "https://hkdk.events/source-id/",
      ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE: "/run/secrets/arc-pay-webhook-secret",
      STEAM_WEB_API_KEY_FILE: "/run/secrets/steam-web-api-key",
      SIH_API_KEY_FILE: "/run/secrets/sih-api-key",
      SIH_STEAM_REFILL_API_KEY_FILE: "/run/secrets/sih-steam-refill-api-key",
      SIH_MARKET_BASE_URL: "https://api.sih.market",
      SIH_STEAM_REFILL_BASE_URL: "https://core.steaminventoryhelper.com",
      SIH_REQUEST_TIMEOUT_MS: "2500",
      SIH_RESPONSE_MAX_BYTES: "4096",
      ADMIN_API_TOKEN_FILE: "/run/secrets/admin-api-token",
      RESEND_API_KEY_FILE: "/run/secrets/resend-api-key",
      RESEND_FROM: "Vault <noreply@vault.example>",
      RESEND_WEBHOOK_SECRET_FILE: "/run/secrets/resend-webhook-secret",
      SLACK_APPLE_ORDERS_WEBHOOK_URL_FILE: "/run/secrets/slack-apple-orders",
      APPLE_GIFT_CARD_ENCRYPTION_KEY_FILE: "/run/secrets/apple-gift-card-encryption-key",
      VV_ADMIN_PUBLIC_ORIGIN: "https://vault.example",
      VV_ADMIN_API_ORIGIN: "https://api.vault.example",
      CATALOG_PUBLIC_GAMES: "cs2,rust,tf2",
      CORS_ORIGINS: "https://vault.example, https://admin.vault.example",
    })).toEqual({
      nodeEnv: "test",
      port: 4100,
      databaseUrl: "postgres://vault:test@localhost:5432/vault",
      redisUrl: "redis://localhost:6379/0",
      admin: {
        apiTokenFile: "/run/secrets/admin-api-token",
      },
      steam: {
        webApiKeyFile: "/run/secrets/steam-web-api-key",
      },
      arcPay: {
        environment: "sandbox",
        providerMode: "fake",
        secretKeyFile: "/run/secrets/arc-pay-secret",
        fakeCheckoutBaseUrl: "http://localhost:3999",
        publicOrigin: "https://hkdk.events/source-id",
        webhookSigningSecretFile: "/run/secrets/arc-pay-webhook-secret",
      },
      sih: {
        apiKeyFile: "/run/secrets/sih-api-key",
        marketBaseUrl: "https://api.sih.market",
        maximumBodyBytes: 4096,
        requestTimeoutMs: 2500,
        steamRefillApiKeyFile: "/run/secrets/sih-steam-refill-api-key",
        steamRefillBaseUrl: "https://core.steaminventoryhelper.com",
      },
      catalog: {
        publicGames: ["cs2", "rust", "tf2"],
      },
      notifications: {
        resendApiKeyFile: "/run/secrets/resend-api-key",
        resendFrom: "Vault <noreply@vault.example>",
        resendWebhookSecretFile: "/run/secrets/resend-webhook-secret",
        slackAppleOrdersWebhookUrlFile: "/run/secrets/slack-apple-orders",
        appleGiftCardEncryptionKeyFile: "/run/secrets/apple-gift-card-encryption-key",
      },
      integration: {
        publicOrigin: "https://vault.example",
        adminOrigin: "https://api.vault.example",
      },
      corsOrigins: ["https://vault.example", "https://admin.vault.example"],
    });
  });

  it("fails closed on invalid ports and payment provider environments", () => {
    expect(() => loadAppConfig({ PORT: "0" })).toThrow("PORT must be between 1 and 65535.");
    expect(() => loadAppConfig({ ARC_PAY_ENVIRONMENT: "qa" })).toThrow("ARC_PAY_ENVIRONMENT must be sandbox or live.");
    expect(loadAppConfig({ ARC_PAY_PROVIDER_MODE: "real" }).arcPay.providerMode).toBe("real");
    expect(() => loadAppConfig({ ARC_PAY_PROVIDER_MODE: "invalid" })).toThrow("ARC_PAY_PROVIDER_MODE must be disabled, fake, or real.");
    expect(() => loadAppConfig({ NODE_ENV: "production", ARC_PAY_PROVIDER_MODE: "fake" })).toThrow("ARC_PAY_PROVIDER_MODE=fake is not allowed in production.");
    expect(() => loadAppConfig({ ARC_PAY_FAKE_CHECKOUT_BASE_URL: "not-url" })).toThrow("ARC_PAY_FAKE_CHECKOUT_BASE_URL must be a valid HTTP(S) URL.");
    expect(() => loadAppConfig({ ARC_PAY_PUBLIC_ORIGIN: "http://vault.example" })).toThrow("ARC_PAY_PUBLIC_ORIGIN must be a valid HTTPS base URL.");
    expect(() => loadAppConfig({ ARC_PAY_PUBLIC_ORIGIN: "https://vault.example/path?query=1" })).toThrow("ARC_PAY_PUBLIC_ORIGIN must be a valid HTTPS base URL.");
    expect(() => loadAppConfig({ VV_ADMIN_PUBLIC_ORIGIN: "http://vault.example" })).toThrow("VV_ADMIN_PUBLIC_ORIGIN must be a valid HTTPS base URL.");
    expect(() => loadAppConfig({ SIH_REQUEST_TIMEOUT_MS: "499" })).toThrow("SIH_REQUEST_TIMEOUT_MS must be between 500 and 120000.");
    expect(() => loadAppConfig({ SIH_RESPONSE_MAX_BYTES: "1023" })).toThrow("SIH_RESPONSE_MAX_BYTES must be between 1024 and 16777216.");
    expect(() => loadAppConfig({ CATALOG_PUBLIC_GAMES: "cs2,dota2" })).toThrow("CATALOG_PUBLIC_GAMES contains unsupported game: dota2.");
    expect(() => loadAppConfig({ NODE_ENV: "production", RESEND_API_KEY_FILE: "/run/secrets/resend" })).toThrow("RESEND_FROM is required");
    expect(loadAppConfig({
      NODE_ENV: "production",
      RESEND_API_KEY_FILE: "/run/secrets/resend",
      RESEND_FROM: "Vault <noreply@turkeyplanners.com>",
    }).notifications).toMatchObject({
      resendApiKeyFile: "/run/secrets/resend",
      resendFrom: "Vault <noreply@turkeyplanners.com>",
    });
  });

  it("loads DATABASE_URL from a secret file without requiring the value in env", () => {
    const directory = mkdtempSync(join(tmpdir(), "vault-config-"));
    const databaseUrlFile = join(directory, "database-url");
    writeFileSync(databaseUrlFile, "postgres://vault:secret@postgres:5432/vault\n", "utf8");

    expect(loadAppConfig({
      DATABASE_URL_FILE: databaseUrlFile,
    }).databaseUrl).toBe("postgres://vault:secret@postgres:5432/vault");
  });
});
