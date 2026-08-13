import { Inject, Injectable } from "@nestjs/common";

import { PaymentsService } from "../payments/payments.service";

const SYNTHETIC_USER_ID = "synthetic:vv-admin";
const SYNTHETIC_TOP_UP_COIN_MINOR = 10_000;

export type IntegrationSyntheticScenarioResult = {
  readonly status: "healthy" | "down";
  readonly summary: string;
  readonly error: string | null;
  readonly payment: { readonly reached: boolean };
  readonly syntheticEntities: readonly {
    readonly type: string;
    readonly externalId: string;
    readonly cleanupStatus: "retained" | "failed" | "cancelled" | "expired";
  }[];
  readonly steps: readonly Record<string, unknown>[];
  readonly artifacts: readonly Record<string, unknown>[] | null;
  readonly metadata: Record<string, unknown> | null;
};

@Injectable()
export class IntegrationSyntheticScenarioService {
  constructor(
    @Inject(PaymentsService) private readonly payments: Pick<PaymentsService, "createTopUpSession">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runCheckoutPaymentReached(input: {
    readonly runId: string;
  }): Promise<IntegrationSyntheticScenarioResult> {
    const startedAt = this.now().toISOString();
    const topUp = await this.payments.createTopUpSession({
      userId: SYNTHETIC_USER_ID,
      idempotencyKey: `vv-admin-synthetic-${input.runId}`,
      coinAmountMinor: SYNTHETIC_TOP_UP_COIN_MINOR,
    });
    const reached = topUp.status === "checkout_pending" && topUp.checkoutUrl !== null;
    return {
      status: reached ? "healthy" : "down",
      summary: reached
        ? "Synthetic checkout reached hosted payment"
        : "Synthetic checkout did not reach hosted payment",
      error: null,
      payment: { reached },
      syntheticEntities: [
        {
          type: "top_up_payment",
          externalId: topUp.id,
          cleanupStatus: "retained",
        },
      ],
      steps: [
        {
          key: "top_up_session",
          status: topUp.status,
          startedAt,
          finishedAt: this.now().toISOString(),
        },
      ],
      artifacts: topUp.checkoutUrl
        ? [{ kind: "final_url", value: topUp.checkoutUrl }]
        : null,
      metadata: {
        topUpPaymentId: topUp.id,
        coinAmountMinor: topUp.coinAmountMinor,
      },
    };
  }
}
