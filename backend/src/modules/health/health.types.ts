export type HealthStatus = "ok" | "degraded";
export type DependencyState = "ok" | "not_configured";

export type LivenessResponse = {
  status: "ok";
  service: "vault-api";
};

export type ReadinessResponse = {
  status: HealthStatus;
  service: "vault-api";
  dependencies: {
    postgres: DependencyState;
    redis: DependencyState;
  };
};

export type CapabilitiesResponse = {
  checkoutEnabled: boolean;
  coinsTopUpEnabled: boolean;
  skinFulfillmentEnabled: boolean;
  steamRefillEnabled: boolean;
  reasons: string[];
};
