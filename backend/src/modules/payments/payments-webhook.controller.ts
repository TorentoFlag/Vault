import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { PaymentsService, type PaymentWebhookResultDto } from "./payments.service";

const paymentWebhookResultSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: {
      type: "string",
      enum: ["processed", "duplicate", "ignored", "unmatched", "rejected"],
    },
  },
};

@ApiTags("Payments")
@Controller("payments/webhooks")
export class PaymentsWebhookController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @ApiOkResponse({ schema: paymentWebhookResultSchema })
  @ApiHeader({
    name: "Webhook-Id",
    required: false,
    description: "Provider webhook idempotency id. In fake mode this may also be present in the JSON payload.",
  })
  @ApiHeader({
    name: "X-Arc-Pay-Signature",
    required: true,
    description: "Webhook signature. Current deterministic local fake mode uses HMAC-SHA256 over canonical JSON.",
  })
  @HttpCode(200)
  @Post("arc-pay")
  handleArcPayWebhook(
    @Headers("webhook-id") providerEventId: string | undefined,
    @Headers("x-arc-pay-signature") signature: string | undefined,
    @Body() payload: unknown,
  ): Promise<PaymentWebhookResultDto> {
    return this.payments.handleArcPayWebhook({
      payload,
      ...(providerEventId === undefined ? {} : { providerEventId }),
      ...(signature === undefined ? {} : { signature }),
    });
  }
}
