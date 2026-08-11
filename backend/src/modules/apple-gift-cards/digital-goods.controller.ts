import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import { CurrentCustomerContext } from "../sessions/current-customer";
import { CustomerSessionGuard } from "../sessions/customer-session.guard";
import type { CurrentCustomer } from "../sessions/sessions.service";
import { AppleGiftCardsService } from "./apple-gift-cards.service";

@UseGuards(CustomerSessionGuard)
@Controller("digital-goods")
export class DigitalGoodsController {
  constructor(@Inject(AppleGiftCardsService) private readonly cards: AppleGiftCardsService) {}

  @Get("me")
  mine(@CurrentCustomerContext() customer: CurrentCustomer): Promise<unknown> {
    return this.cards.listCustomerDigitalGoods(customer.userId);
  }
}
