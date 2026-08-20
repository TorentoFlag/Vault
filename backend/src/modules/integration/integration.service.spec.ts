import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/app-config";
import { IntegrationService } from "./integration.service";

const config: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  databaseUrl: "postgres://vault:test@localhost:5432/vault",
  redisUrl: "redis://localhost:6379/0",
  admin: { apiTokenFile: "/run/secrets/admin-token" },
  steam: {},
  arcPay: {
    environment: "sandbox",
    providerMode: "real",
    secretKeyFile: "/run/secrets/arc-pay",
    publicOrigin: "https://hkdk.events/source-id",
  },
  sih: {
    apiKeyFile: "/run/secrets/sih",
    marketBaseUrl: "https://api.sih.market",
    maximumBodyBytes: 4096,
    requestTimeoutMs: 2500,
    steamRefillApiKeyFile: "/run/secrets/sih-steam-refill",
    steamRefillBaseUrl: "https://core.steaminventoryhelper.com",
  },
  catalog: { publicGames: ["cs2", "rust", "tf2"] },
  notifications: {},
  integration: {
    publicOrigin: "https://vault.example",
    adminOrigin: "https://api.vault.example",
    vvAdminSiteKey: "vault",
    vvAdminWebhookSecretFile: "/run/secrets/vv-admin-integration-secret",
  },
  corsOrigins: [],
};

describe("IntegrationService", () => {
  it("publishes the current VV Admin manifest with Locker-class checks and Apple catalog capability", () => {
    const manifest = new IntegrationService(config).manifest();

    expect(manifest).toMatchObject({
      site: {
        key: "vault",
        displayName: "Vault",
        publicOrigin: "https://vault.example",
        adminOrigin: "https://api.vault.example",
        adminAllowedHosts: ["api.vault.example"],
      },
      commerceEvents: {
        schemaVersion: 1,
        delivery: "site_to_vv_admin_webhook",
      },
    });
    expect(manifest).not.toHaveProperty("protocolVersion");
    expect(manifest.healthChecks.map((check) => check.key)).toEqual([
      "backend_http",
      "frontend_http",
      "postgres",
      "redis",
      "top_up_payment",
      "checkout_fulfillment",
      "quote_storage",
      "steam_refill",
      "visible_catalog",
      "catalog_cs2",
      "catalog_rust",
      "catalog_tf2",
      "apple_gift_cards",
    ]);
    expect(manifest.catalog).toMatchObject({
      baseUrl: "https://api.vault.example/admin/integration/catalog",
      auth: { scheme: "vv_hmac" },
      locales: ["ru"],
      media: { mode: "url" },
      resources: {
        products: { enabled: true, categoryRequired: true },
        offers: { enabled: true, requiredForPurchasableProduct: true },
        destinations: { enabled: false, orderedProductMembership: false },
        sellers: { enabled: false, mode: "none" },
        collections: { enabled: false },
      },
    });
    expect(manifest.syntheticScenarios).toEqual([
      expect.objectContaining({
        key: "checkout_payment_reached",
        label: "Проверить выход на оплату",
        kind: "synthetic_transaction",
        productionSafe: true,
        effect: "creates_synthetic_entities",
        requiresCleanup: true,
        run: {
          method: "POST",
          url: "https://api.vault.example/admin/integration/scenarios/checkout-payment-reached/run",
        },
      }),
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/secret|token|password/i);
  });

  it("reports readiness from configured dependencies", () => {
    expect(new IntegrationService(config).readiness()).toEqual({
      status: "ok",
      checks: {
        postgres: "ok",
        redis: "ok",
        arcPay: "ok",
        sih: "ok",
        adminApi: "ok",
      },
    });
  });
});
