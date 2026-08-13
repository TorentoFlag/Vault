import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationSyntheticScenarioService } from "./integration-synthetic-scenario.service";
import type { PaymentsService, TopUpSessionDto } from "../payments/payments.service";

describe("IntegrationSyntheticScenarioService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes only when the synthetic top-up reaches a hosted payment URL", async () => {
    const payments: Pick<PaymentsService, "createTopUpSession"> = {
      createTopUpSession: vi.fn().mockResolvedValue(
        createTopUp({
          id: "top-up-1",
          status: "checkout_pending",
          checkoutUrl: "https://pay.example/checkout/session-1",
        }),
      ),
    };
    const service = new IntegrationSyntheticScenarioService(payments);

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
        createTopUpSession: vi.fn().mockResolvedValue(
          createTopUp({
            id: "top-up-1",
            status: "provider_configuration_required",
            checkoutUrl: null,
          }),
        ),
      },
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

function createTopUp(
  input: Pick<TopUpSessionDto, "id" | "status" | "checkoutUrl">,
): TopUpSessionDto {
  return {
    id: input.id,
    userId: "synthetic:vv-admin",
    status: input.status,
    provider: "arc_pay",
    coinAmountMinor: 10_000,
    fiatAmountMinor: 6_667,
    fiatCurrency: "RUB",
    rate: {
      fiatMinor: 100,
      coinMinor: 150,
    },
    checkoutUrl: input.checkoutUrl,
  };
}
