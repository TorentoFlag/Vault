import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { CurrentCustomerContext } from "../sessions/current-customer";
import { CustomerSessionGuard } from "../sessions/customer-session.guard";
import type { CurrentCustomer } from "../sessions/sessions.service";
import { WalletService, type WalletBalanceDto } from "./wallet.service";

const walletBalanceSchema = {
  type: "object",
  required: ["postedCoinMinor", "heldCoinMinor", "availableCoinMinor"],
  properties: {
    postedCoinMinor: { type: "integer", minimum: 0 },
    heldCoinMinor: { type: "integer", minimum: 0 },
    availableCoinMinor: { type: "integer", minimum: 0 },
  },
};

@ApiTags("Wallet")
@UseGuards(CustomerSessionGuard)
@Controller("wallet")
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  @ApiOkResponse({ schema: walletBalanceSchema })
  @Get("me")
  me(@CurrentCustomerContext() customer: CurrentCustomer): Promise<WalletBalanceDto> {
    return this.wallet.getBalance(customer.userId);
  }
}
