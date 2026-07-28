import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { SessionsModule } from "../sessions/sessions.module";
import { WalletModule } from "../wallet/wallet.module";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [DatabaseModule, SessionsModule, WalletModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
