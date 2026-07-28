import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { SessionsModule } from "../sessions/sessions.module";
import { WalletModule } from "../wallet/wallet.module";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { ArcPayClient } from "../providers/arc-pay/arc-pay.client";

@Module({
  imports: [DatabaseModule, SessionsModule, WalletModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    {
      provide: ArcPayClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ArcPayClient => new ArcPayClient({
        apiKeyFile: config.arcPay.secretKeyFile ?? "",
      }),
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
