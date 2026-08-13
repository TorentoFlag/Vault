import { describe, expect, it, vi } from "vitest";

import { IntegrationSyntheticScenarioService } from "./integration-synthetic-scenario.service";

describe("IntegrationSyntheticScenarioService", () => {
  it("passes only when the synthetic top-up reaches a hosted payment URL", async () => {
    const payments = {
      createTopUpSession: vi.fn().mockResolvedValue({
        id: "top-up-1",
        status: "checkout_pending",
        checkoutUrl: "https://pay.example/checkout/session-1",
      }),
    };
    const service = new IntegrationSyntheticScenarioService(
      payments as never,
      () => new Date("2026-08-13T12:00:00.000Z"),
    );

    await expect(
      service.runCheckoutPaymentReached({ runId: "run-1" }),
    ).resolves.toMatchObject({
      status: "healthy",
      payment: { reached: true },
      syntheticEntities: [
        {
          type: "top_up_payment",
          externalId: "top-up-1",
          cleanupStatus: "retained",
        },
      ],
      artifacts: [
        {
          kind: "final_url",
          value: "https://pay.example/checkout/session-1",
        },
      ],
    });
    expect(payments.createTopUpSession).toHaveBeenCalledWith({
      userId: "synthetic:vv-admin",
      idempotencyKey: "vv-admin-synthetic-run-1",
      coinAmountMinor: 10_000,
    });
  });

  it("fails when the top-up session does not reach payment", async () => {
    const service = new IntegrationSyntheticScenarioService(
      {
        createTopUpSession: vi.fn().mockResolvedValue({
          id: "top-up-1",
          status: "provider_configuration_required",
          checkoutUrl: null,
        }),
      } as never,
      () => new Date("2026-08-13T12:00:00.000Z"),
    );

    await expect(
      service.runCheckoutPaymentReached({ runId: "run-2" }),
    ).resolves.toMatchObject({
      status: "down",
      payment: { reached: false },
      summary: "Synthetic checkout did not reach hosted payment",
    });
  });
});
