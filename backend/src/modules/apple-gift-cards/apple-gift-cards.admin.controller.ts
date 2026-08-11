import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";

import { IDEMPOTENCY_KEY_HEADER } from "../../common/http/http-headers";
import { AdminGuard } from "../admin/admin.guard";
import { AppleGiftCardsService } from "./apple-gift-cards.service";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Request body is invalid");
  return value as Record<string, unknown>;
}

@UseGuards(AdminGuard)
@Controller("admin/apple-gift-cards")
export class AppleGiftCardsAdminController {
  constructor(@Inject(AppleGiftCardsService) private readonly cards: AppleGiftCardsService) {}

  @Get("pending")
  pending(): Promise<unknown> {
    return this.cards.listPending();
  }

  @HttpCode(202)
  @Post(":orderLineId/deliveries")
  async deliver(
    @Param("orderLineId") orderLineId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<{ notificationId: string; status: "queued" }> {
    const value = record(body);
    if (typeof value.code !== "string" || typeof value.reason !== "string" || !idempotencyKey) throw new BadRequestException("Delivery request is invalid");
    return this.cards.recordManualDelivery({ actorId: "admin-token", code: value.code, reason: value.reason, orderLineId, idempotencyKey });
  }
}
