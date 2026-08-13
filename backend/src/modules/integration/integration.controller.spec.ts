import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { IntegrationController } from "./integration.controller";

describe("IntegrationController synthetic scenario endpoint", () => {
  it("runs checkout-payment-reached when the signed request is valid", async () => {
    const scenario = {
      runCheckoutPaymentReached: vi.fn().mockResolvedValue({ status: "healthy" }),
    };
    const verifier = { verify: vi.fn().mockReturnValue(true) };
    const controller = new IntegrationController(
      {} as never,
      scenario as never,
      verifier as never,
    );

    await expect(
      controller.runCheckoutPaymentReached(
        { runId: "run-1" },
      {
        "x-vv-admin-signature": "test-signature",
        "x-vv-admin-timestamp": "2026-08-13T12:00:00.000Z",
      },
      ),
    ).resolves.toEqual({ status: "healthy" });
    expect(scenario.runCheckoutPaymentReached).toHaveBeenCalledWith({
      runId: "run-1",
    });
  });

  it("rejects missing run id", async () => {
    const controller = new IntegrationController({} as never, {
      runCheckoutPaymentReached: vi.fn(),
    } as never, { verify: vi.fn().mockReturnValue(true) } as never);

    await expect(
      controller.runCheckoutPaymentReached({}, {
        "x-vv-admin-signature": "test-signature",
        "x-vv-admin-timestamp": "2026-08-13T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsigned requests", async () => {
    const controller = new IntegrationController({} as never, {
      runCheckoutPaymentReached: vi.fn(),
    } as never, { verify: vi.fn().mockReturnValue(false) } as never);

    await expect(
      controller.runCheckoutPaymentReached({ runId: "run-1" }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
