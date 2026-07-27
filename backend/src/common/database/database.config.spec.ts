import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../config/app-config";
import { buildDatabaseConnectionOptions } from "./database.config";

const baseConfig: AppConfig = {
  nodeEnv: "test",
  port: 3000,
  arcPay: { environment: "sandbox" },
  sih: {},
  corsOrigins: [],
};

describe("buildDatabaseConnectionOptions", () => {
  it("keeps the database disabled until DATABASE_URL is configured", () => {
    expect(buildDatabaseConnectionOptions(baseConfig)).toEqual({
      enabled: false,
      reason: "DATABASE_URL_MISSING",
    });
  });

  it("exposes a configured database url without connecting during module bootstrap", () => {
    expect(buildDatabaseConnectionOptions({
      ...baseConfig,
      databaseUrl: "postgres://vault:vault@localhost:55432/vault",
    })).toEqual({
      enabled: true,
      databaseUrl: "postgres://vault:vault@localhost:55432/vault",
    });
  });
});
