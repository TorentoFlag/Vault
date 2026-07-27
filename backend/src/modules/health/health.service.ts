import { Inject, Injectable } from "@nestjs/common";

import type { AppConfig } from "../../config/app-config";
import { APP_CONFIG } from "../../config/app-config.module";
import type { CapabilitiesResponse, LivenessResponse, ReadinessResponse } from "./health.types";

@Injectable()
export class HealthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  liveness(): LivenessResponse {
    return {
      status: "ok",
      service: "vault-api",
    };
  }

  readiness(): ReadinessResponse {
    const postgres = this.config.databaseUrl ? "ok" : "not_configured";
    const redis = this.config.redisUrl ? "ok" : "not_configured";

    return {
      status: postgres === "ok" && redis === "ok" ? "ok" : "degraded",
      service: "vault-api",
      dependencies: {
        postgres,
        redis,
      },
    };
  }

  capabilities(): CapabilitiesResponse {
    const reasons = [
      ...(this.config.databaseUrl ? [] : ["DATABASE_NOT_CONFIGURED"]),
      ...(this.config.redisUrl ? [] : ["REDIS_NOT_CONFIGURED"]),
      ...(this.config.arcPay.secretKeyFile ? [] : ["ARC_PAY_NOT_CONFIGURED"]),
      ...(this.config.sih.apiKeyFile ? [] : ["SIH_NOT_CONFIGURED"]),
    ];

    const hasCore = Boolean(this.config.databaseUrl && this.config.redisUrl);
    const hasArcPay = Boolean(this.config.arcPay.secretKeyFile);
    const hasSih = Boolean(this.config.sih.apiKeyFile);

    return {
      checkoutEnabled: hasCore && hasArcPay && hasSih,
      coinsTopUpEnabled: hasCore && hasArcPay,
      skinFulfillmentEnabled: hasCore && hasSih,
      steamRefillEnabled: hasCore && hasSih,
      reasons,
    };
  }
}
