import { Body, Controller, Headers, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { IDEMPOTENCY_KEY_HEADER } from "../../common/http/http-headers";
import { CurrentCustomerContext } from "../sessions/current-customer";
import { CsrfGuard } from "../sessions/csrf.guard";
import { CustomerSessionGuard } from "../sessions/customer-session.guard";
import type { CurrentCustomer } from "../sessions/sessions.service";
import { PaymentsService, type TopUpSessionDto } from "./payments.service";

type CreateTopUpSessionBody = {
  coinAmountMinor: number;
};

const topUpSessionSchema = {
  type: "object",
  required: ["id", "userId", "status", "provider", "coinAmountMinor", "fiatAmountMinor", "fiatCurrency", "rate", "checkoutUrl"],
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string" },
    status: { type: "string", enum: ["provider_configuration_required", "checkout_pending", "paid", "failed"] },
    provider: { type: "string", enum: ["arc_pay"] },
    coinAmountMinor: { type: "integer", minimum: 10_000, maximum: 10_000_000 },
    fiatAmountMinor: { type: "integer", minimum: 1 },
    fiatCurrency: { type: "string", enum: ["RUB"] },
    rate: {
      type: "object",
      required: ["fiatMinor", "coinMinor"],
      properties: {
        fiatMinor: { type: "integer", enum: [100] },
        coinMinor: { type: "integer", enum: [150] },
      },
    },
    checkoutUrl: { type: "string", nullable: true },
  },
};

@ApiTags("Payments")
@UseGuards(CustomerSessionGuard, CsrfGuard)
@Controller("payments")
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @ApiOkResponse({ schema: topUpSessionSchema })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "Unique customer-scoped top-up session key.",
  })
  @ApiBody({
    required: true,
    schema: {
      type: "object",
      required: ["coinAmountMinor"],
      properties: {
        coinAmountMinor: { type: "integer", minimum: 10_000, maximum: 10_000_000 },
      },
    },
  })
  @HttpCode(200)
  @Post("top-up/sessions")
  createTopUpSession(
    @CurrentCustomerContext() customer: CurrentCustomer,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() body: CreateTopUpSessionBody,
  ): Promise<TopUpSessionDto> {
    return this.payments.createTopUpSession({
      userId: customer.userId,
      idempotencyKey: idempotencyKey ?? "",
      coinAmountMinor: body.coinAmountMinor,
    });
  }
}
