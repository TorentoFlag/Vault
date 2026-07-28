import { Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiTags } from "@nestjs/swagger";

import { IDEMPOTENCY_KEY_HEADER } from "../../common/http/http-headers";
import { CartService } from "../cart/cart.service";
import { CsrfGuard } from "../sessions/csrf.guard";
import { CurrentCustomerContext } from "../sessions/current-customer";
import { CustomerSessionGuard } from "../sessions/customer-session.guard";
import type { CurrentCustomer } from "../sessions/sessions.service";
import { CheckoutService, type CheckoutFromCartCommand, type CheckoutOrderDto } from "./checkout.service";

type CheckoutRequestBody = Pick<CheckoutFromCartCommand, "items">;

@ApiTags("Checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(CartService) private readonly cart: CartService,
  ) {}

  @ApiCreatedResponse({
    schema: {
      type: "object",
      required: ["id", "userId", "status", "totalCoinMinor", "recipientSnapshots", "lines"],
      properties: {
        id: { type: "string", format: "uuid" },
        userId: { type: "string" },
        status: { type: "string", enum: ["held"] },
        totalCoinMinor: { type: "integer", minimum: 1 },
        recipientSnapshots: { type: "array", items: { type: "object" } },
        lines: { type: "array", items: { type: "object" } },
      },
    },
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "Unique customer-scoped checkout command key.",
  })
  @ApiBody({
    required: true,
    schema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["productSlug", "quantity"],
            properties: {
              productSlug: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 50 },
              recipient: {
                type: "object",
                properties: {
                  steamLogin: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  })
  @UseGuards(CustomerSessionGuard, CsrfGuard)
  @Post()
  create(
    @CurrentCustomerContext() customer: CurrentCustomer,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() body: CheckoutRequestBody,
  ): Promise<CheckoutOrderDto> {
    return this.checkout.checkoutFromCart({
      userId: customer.userId,
      idempotencyKey: idempotencyKey ?? "",
      items: body.items,
    });
  }

  @ApiCreatedResponse({
    schema: {
      type: "object",
      required: ["id", "userId", "status", "totalCoinMinor", "recipientSnapshots", "lines"],
      properties: {
        id: { type: "string", format: "uuid" },
        userId: { type: "string" },
        status: { type: "string", enum: ["held"] },
        totalCoinMinor: { type: "integer", minimum: 1 },
        recipientSnapshots: { type: "array", items: { type: "object" } },
        lines: { type: "array", items: { type: "object" } },
      },
    },
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "Unique customer-scoped checkout command key.",
  })
  @UseGuards(CustomerSessionGuard, CsrfGuard)
  @Post("cart")
  async createFromServerCart(
    @CurrentCustomerContext() customer: CurrentCustomer,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ): Promise<CheckoutOrderDto> {
    const order = await this.checkout.checkoutFromCart({
      userId: customer.userId,
      idempotencyKey: idempotencyKey ?? "",
      items: await this.cart.getCheckoutItems(customer.userId),
    });
    await this.cart.clearCart(customer.userId);
    return order;
  }
}
