import { Controller, Get, Headers, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { IDEMPOTENCY_KEY_HEADER } from "../../common/http/http-headers";
import { CsrfGuard } from "../sessions/csrf.guard";
import { CurrentCustomerContext } from "../sessions/current-customer";
import { CustomerSessionGuard } from "../sessions/customer-session.guard";
import type { CurrentCustomer } from "../sessions/sessions.service";
import { InventoryService, type InventoryDto, type InventoryWithdrawalDto } from "./inventory.service";

const inventoryActionSchema = {
  type: "object",
  required: ["enabled", "reason"],
  properties: {
    enabled: { type: "boolean" },
    reason: { type: "string", enum: ["available", "not_supported", "steam_trade_url_required"] },
  },
};

const inventorySchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "orderId", "productSlug", "title", "unitPriceCoinMinor", "acquiredAt", "status", "actions"],
        properties: {
          id: { type: "string", format: "uuid" },
          orderId: { type: "string", format: "uuid" },
          productSlug: { type: "string" },
          title: { type: "string" },
          unitPriceCoinMinor: { type: "integer", minimum: 1 },
          acquiredAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["owned"] },
          actions: {
            type: "object",
            required: ["sellToSite", "withdrawToSteam"],
            properties: {
              sellToSite: inventoryActionSchema,
              withdrawToSteam: inventoryActionSchema,
            },
          },
        },
      },
    },
  },
};

const inventoryWithdrawalSchema = {
  type: "object",
  required: ["createdAt", "id", "itemId", "orderId", "orderNumber", "status", "title"],
  properties: {
    createdAt: { type: "string", format: "date-time" },
    id: { type: "string", format: "uuid" },
    itemId: { type: "string", format: "uuid" },
    orderId: { type: "string", format: "uuid" },
    orderNumber: { type: "string" },
    status: { type: "string", enum: ["pending"] },
    title: { type: "string" },
  },
};

@ApiTags("Inventory")
@UseGuards(CustomerSessionGuard)
@Controller("inventory")
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @ApiOkResponse({ schema: inventorySchema })
  @Get("me")
  me(@CurrentCustomerContext() customer: CurrentCustomer): Promise<InventoryDto> {
    return this.inventory.listUserInventory(customer.userId);
  }

  @ApiOkResponse({ schema: inventoryWithdrawalSchema })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "Unique customer-scoped inventory withdrawal command key.",
  })
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  @Post("me/items/:itemId/withdrawals")
  withdrawToSteam(
    @CurrentCustomerContext() customer: CurrentCustomer,
    @Param("itemId") itemId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ): Promise<InventoryWithdrawalDto> {
    return this.inventory.requestWithdrawal({
      userId: customer.userId,
      itemId,
      idempotencyKey,
    });
  }
}
