import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/app-config";
import { buildQueueConnectionOptions } from "./queue.config";

const baseConfig: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  steam: {},
  arcPay: { environment: "sandbox", providerMode: "disabled" },
  sih: {
    marketBaseUrl: "https://api.sih.market",
    maximumBodyBytes: 16_777_216,
    requestTimeoutMs: 60_000,
    steamRefillBaseUrl: "https://core.steaminventoryhelper.com",
  },
  corsOrigins: [],
};

describe("buildQueueConnectionOptions", () => {
  it("keeps queues disabled until REDIS_URL is configured", () => {
    expect(buildQueueConnectionOptions(baseConfig)).toEqual({
      enabled: false,
      reason: "REDIS_URL_MISSING",
    });
  });

  it("exposes a configured redis url without connecting during module bootstrap", () => {
    expect(buildQueueConnectionOptions({
      ...baseConfig,
      redisUrl: "redis://localhost:56379/0",
    })).toEqual({
      enabled: true,
      redisUrl: "redis://localhost:56379/0",
    });
  });
});
