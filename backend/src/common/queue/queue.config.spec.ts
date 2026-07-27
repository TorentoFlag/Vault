import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/app-config";
import { buildQueueConnectionOptions } from "./queue.config";

const baseConfig: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  arcPay: { environment: "sandbox" },
  sih: {},
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
