import { Inject, Injectable } from "@nestjs/common";

import type { AppConfig } from "../../config/app-config";
import { APP_CONFIG } from "../../config/app-config.module";

type IntegrationManifest = {
  readonly site: {
    readonly key: "vault";
    readonly displayName: "Vault";
    readonly publicOrigin: string;
    readonly adminOrigin: string;
  };
  readonly commerceEvents: {
    readonly schemaVersion: 1;
    readonly delivery: "site_to_vv_admin_webhook";
  };
  readonly healthChecks: readonly {
    readonly key: string;
    readonly label: string;
    readonly kind: "http_status" | "json_status";
    readonly method: "GET";
    readonly url: string;
    readonly timeoutMs: number;
    readonly intervalSeconds: number;
    readonly expect?: Record<string, unknown>;
  }[];
  readonly syntheticScenarios: readonly {
    readonly key: string;
    readonly label: string;
    readonly kind: "synthetic_transaction";
    readonly productionSafe: boolean;
    readonly effect: "creates_synthetic_entities";
    readonly requiresCleanup: boolean;
    readonly timeoutMs: number;
    readonly intervalSeconds: number;
    readonly run: { readonly method: "POST"; readonly url: string };
  }[];
  readonly actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly category:
      | "payments.reconcile"
      | "fulfillment.reconcile"
      | "manual_fulfillment.list";
    readonly method: "GET" | "POST";
    readonly url: string;
    readonly effect: "read_only" | "recovery";
    readonly requiresIdempotencyKey: boolean;
  }[];
  readonly catalog: {
    readonly baseUrl: string;
    readonly auth: { readonly scheme: "vv_hmac" };
    readonly locales: readonly ["ru"];
    readonly categories: {
      readonly enabled: true;
      readonly maxDepth: 1;
      readonly fields: readonly ["name", "slug", "sortOrder", "isActive"];
      readonly deletion: {
        readonly mode: "blocked_by_references";
        readonly dryRun: true;
      };
    };
    readonly resources: {
      readonly products: {
        readonly enabled: true;
        readonly categoryRequired: true;
        readonly schema: Record<string, unknown>;
      };
      readonly offers: {
        readonly enabled: true;
        readonly requiredForPurchasableProduct: true;
        readonly schema: Record<string, unknown>;
      };
      readonly destinations: {
        readonly enabled: false;
        readonly orderedProductMembership: false;
      };
      readonly sellers: {
        readonly enabled: false;
        readonly mode: "none";
      };
      readonly collections: {
        readonly enabled: false;
      };
    };
    readonly media: {
      readonly mode: "url";
      readonly maxBytes: number;
      readonly mimeTypes: readonly ["image/jpeg", "image/png", "image/webp"];
    };
  };
};

type IntegrationReadiness = {
  readonly status: "ok" | "degraded";
  readonly checks: {
    readonly postgres: "ok" | "not_configured";
    readonly redis: "ok" | "not_configured";
    readonly arcPay: "ok" | "not_configured";
    readonly sih: "ok" | "not_configured";
    readonly adminApi: "ok" | "not_configured";
  };
};

@Injectable()
export class IntegrationService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  manifest(): IntegrationManifest {
    const publicOrigin = this.config.integration.publicOrigin;
    const adminOrigin = this.config.integration.adminOrigin;
    return {
      site: {
        key: "vault",
        displayName: "Vault",
        publicOrigin,
        adminOrigin,
      },
      commerceEvents: {
        schemaVersion: 1,
        delivery: "site_to_vv_admin_webhook",
      },
      healthChecks: [
        {
          key: "backend_http",
          label: "Backend",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/health/live`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "frontend_http",
          label: "Frontend",
          kind: "http_status",
          method: "GET",
          url: `${publicOrigin}/`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "postgres",
          label: "База данных",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/health/ready`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "redis",
          label: "Redis",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/redis`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "top_up_payment",
          label: "Arc Pay пополнение",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/top-up`,
          timeoutMs: 10000,
          intervalSeconds: 21600,
        },
        {
          key: "checkout_fulfillment",
          label: "Checkout и выдача",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/checkout`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "quote_storage",
          label: "Хранилище котировок",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/quote-storage`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "steam_refill",
          label: "Steam refill",
          kind: "http_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/steam-refill`,
          timeoutMs: 5000,
          intervalSeconds: 21600,
        },
        {
          key: "visible_catalog",
          label: "Товары в каталоге",
          kind: "json_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/catalog-visible`,
          timeoutMs: 10000,
          intervalSeconds: 21600,
          expect: { status: "ok" },
        },
        ...this.config.catalog.publicGames.map((game) => ({
          key: `catalog_${game}`,
          label: `Каталог ${game.toUpperCase()}`,
          kind: "http_status" as const,
          method: "GET" as const,
          url: `${adminOrigin}/admin/integration/health/catalog/${game}`,
          timeoutMs: 10000,
          intervalSeconds: 21600,
        })),
        {
          key: "apple_gift_cards",
          label: "Подарочные карты Apple",
          kind: "json_status",
          method: "GET",
          url: `${adminOrigin}/admin/integration/health/apple-gift-cards`,
          timeoutMs: 10000,
          intervalSeconds: 21600,
          expect: { status: "ok" },
        },
      ],
      syntheticScenarios: [
        {
          key: "checkout_payment_reached",
          label: "Проверить выход на оплату",
          kind: "synthetic_transaction",
          productionSafe: true,
          effect: "creates_synthetic_entities",
          requiresCleanup: true,
          timeoutMs: 60000,
          intervalSeconds: 21600,
          run: {
            method: "POST",
            url: `${adminOrigin}/admin/integration/scenarios/checkout-payment-reached/run`,
          },
        },
      ],
      actions: [
        {
          key: "payments_reconcile",
          label: "Reconcile payment provider top-ups",
          category: "payments.reconcile",
          method: "POST",
          url: `${adminOrigin}/admin/operations/payments/reconcile`,
          effect: "recovery",
          requiresIdempotencyKey: true,
        },
        {
          key: "fulfillment_reconcile",
          label: "Reconcile submitted SIH fulfillment",
          category: "fulfillment.reconcile",
          method: "POST",
          url: `${adminOrigin}/admin/operations/fulfillment/reconcile`,
          effect: "recovery",
          requiresIdempotencyKey: true,
        },
        {
          key: "operations_overview",
          label: "Read Vault admin operations overview",
          category: "manual_fulfillment.list",
          method: "GET",
          url: `${adminOrigin}/admin/operations/overview`,
          effect: "read_only",
          requiresIdempotencyKey: false,
        },
      ],
      catalog: {
        baseUrl: `${adminOrigin}/admin/integration/catalog`,
        auth: { scheme: "vv_hmac" },
        locales: ["ru"],
        categories: {
          enabled: true,
          maxDepth: 1,
          fields: ["name", "slug", "sortOrder", "isActive"],
          deletion: {
            mode: "blocked_by_references",
            dryRun: true,
          },
        },
        resources: {
          products: {
            enabled: true,
            categoryRequired: true,
            schema: appleProductSchema(),
          },
          offers: {
            enabled: true,
            requiredForPurchasableProduct: true,
            schema: appleOfferSchema(),
          },
          destinations: {
            enabled: false,
            orderedProductMembership: false,
          },
          sellers: {
            enabled: false,
            mode: "none",
          },
          collections: {
            enabled: false,
          },
        },
        media: {
          mode: "url",
          maxBytes: 0,
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        },
      },
    };
  }

  readiness(): IntegrationReadiness {
    const checks = {
      postgres: this.config.databaseUrl ? "ok" : "not_configured",
      redis: this.config.redisUrl ? "ok" : "not_configured",
      arcPay:
        this.config.arcPay.secretKeyFile && this.config.arcPay.publicOrigin
          ? "ok"
          : "not_configured",
      sih:
        this.config.sih.apiKeyFile && this.config.sih.steamRefillApiKeyFile
          ? "ok"
          : "not_configured",
      adminApi: this.config.admin.apiTokenFile ? "ok" : "not_configured",
    } as const;
    return {
      status: Object.values(checks).every((status) => status === "ok")
        ? "ok"
        : "degraded",
      checks,
    };
  }
}

function appleProductSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: [
      "currency",
      "nominalMinor",
      "regionCode",
      "regionLabel",
      "fulfillmentTitle",
      "fulfillmentDescription",
      "fulfillmentRequirement",
    ],
    properties: {
      currency: { type: "string", title: "Валюта номинала" },
      nominalMinor: { type: "integer", minimum: 1, title: "Номинал в minor units" },
      regionCode: { type: "string", title: "Код региона" },
      regionLabel: { type: "string", title: "Регион" },
      fulfillmentTitle: { type: "string", title: "Заголовок выдачи" },
      fulfillmentDescription: { type: "string", title: "Описание выдачи" },
      fulfillmentRequirement: { type: "string", title: "Требование к выдаче" },
    },
  };
}

function appleOfferSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      fulfillmentMode: {
        type: "string",
        enum: ["manual"],
        title: "Способ выдачи",
        readOnly: true,
      },
    },
  };
}
